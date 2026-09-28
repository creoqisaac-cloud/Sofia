/**
 * Cotizador V2: arma insumos CON FUENTE desde la BD y delega el cálculo al motor puro
 * (`src/domain/quote-v2.ts`). También calibra programas contra corridas reales de Mario.
 */
import { and, desc, eq } from "drizzle-orm";
import { effectiveStatus, matchesScope } from "@/domain/knowledge";
import { calibrateProgram, computeQuoteV2, type FinanceProgramSpec, type ProgramCalibrationStatus, type QuoteV2Result, type SourcedAmount } from "@/domain/quote-v2";
import type { AppContext } from "../app";
import { findVehicle, findVersion, loadCatalog, type CatalogSnapshot } from "../commercial/catalog";
import { pickListPrice, resolveBonusFor } from "../commercial/quoting";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { ServiceError } from "./errors";
import { lookupScenario } from "./quotes";

type ProgramRow = typeof s.financePrograms.$inferSelect;

async function sourceName(db: Db, id: string | null) {
  if (!id) return null;
  const [src] = await db.select({ name: s.knowledgeSources.name }).from(s.knowledgeSources).where(eq(s.knowledgeSources.id, id));
  return src?.name ?? null;
}

export function toProgramSpec(p: ProgramRow, terms: Array<typeof s.financeTerms.$inferSelect>, sourceLabel: string): FinanceProgramSpec {
  return {
    id: p.id,
    lender: p.lender,
    name: p.name,
    sourceLabel,
    isDemo: p.isDemo,
    calibrationStatus: p.calibrationStatus as ProgramCalibrationStatus,
    validFrom: p.validFrom,
    validTo: p.validTo,
    bonusApplication: (p.bonusApplication as FinanceProgramSpec["bonusApplication"]) ?? null,
    ivaOnInterest: p.ivaOnInterest,
    ivaRate: p.ivaRate,
    openingCommissionRate: p.openingCommissionRate,
    openingCommissionFinanced: p.openingCommissionFinanced,
    openingCommissionIva: p.openingCommissionIva,
    insuranceMode: (p.insuranceMode as FinanceProgramSpec["insuranceMode"]) ?? null,
    minDownPaymentRate: p.minDownPaymentRate,
    terms: terms.filter((t) => t.programId === p.id).map((t) => ({ termMonths: t.termMonths, annualRate: t.annualRate })),
  };
}

const RANK: Record<string, number> = { validated: 3, calibrating: 2, unverified: 1, expired: 0 };

async function pickProgram(app: AppContext, model: string, version: string, now: Date) {
  const rows = await app.db.select().from(s.financePrograms).where(eq(s.financePrograms.workspaceId, app.workspaceId));
  const usable = rows
    .filter((p) => matchesScope(p, model, version))
    .filter((p) => !effectiveStatus({ status: "confirmed", validFrom: p.validFrom, validTo: p.validTo }, now).expired)
    .sort((a, b) => (RANK[b.calibrationStatus] ?? 0) - (RANK[a.calibrationStatus] ?? 0));
  const p = usable[0];
  if (!p) return null;
  const terms = await app.db.select().from(s.financeTerms).where(eq(s.financeTerms.programId, p.id));
  return toProgramSpec(p, terms, (await sourceName(app.db, p.sourceId)) ?? p.name);
}

async function pickPrice(app: AppContext, cat: CatalogSnapshot, versionId: string, now: Date): Promise<SourcedAmount | null> {
  const rows = await app.db
    .select({ price: s.vehiclePrices.listPrice, book: s.priceBooks })
    .from(s.vehiclePrices)
    .innerJoin(s.priceBooks, eq(s.vehiclePrices.priceBookId, s.priceBooks.id))
    .where(and(eq(s.vehiclePrices.versionId, versionId), eq(s.priceBooks.workspaceId, app.workspaceId)));
  const current = rows.filter((r) => effectiveStatus(r.book, now).presentableAsCurrent);
  const r = (current.length ? current : rows).sort((a, b) => (b.book.validFrom?.getTime() ?? 0) - (a.book.validFrom?.getTime() ?? 0))[0];
  if (r) return { amount: r.price, sourceLabel: (await sourceName(app.db, r.book.sourceId)) ?? r.book.name, status: r.book.status, validFrom: r.book.validFrom, validTo: r.book.validTo, isDemo: r.book.isDemo };
  // Respaldo: precio de lista de Sprint 1 (también con fuente y vigencia).
  const offer = pickListPrice(cat, versionId, now);
  if (!offer || offer.amount === null) return null;
  return { amount: offer.amount, sourceLabel: (await sourceName(app.db, offer.sourceId)) ?? offer.title, status: offer.status, validFrom: offer.validFrom, validTo: offer.validTo, isDemo: offer.isDemo };
}

async function pickInsurance(app: AppContext, model: string, version: string, termMonths: number, now: Date): Promise<SourcedAmount | null> {
  const rows = await app.db
    .select()
    .from(s.quoteComponentsConfig)
    .where(and(eq(s.quoteComponentsConfig.workspaceId, app.workspaceId), eq(s.quoteComponentsConfig.kind, "insurance")));
  const match = rows
    .filter((r) => matchesScope(r, model, version) && (r.termMonths === null || r.termMonths === termMonths))
    .filter((r) => effectiveStatus(r, now).presentableAsCurrent)
    .sort((a, b) => Number(b.termMonths !== null) - Number(a.termMonths !== null))[0];
  if (!match) return null;
  return { amount: match.amount, sourceLabel: (await sourceName(app.db, match.sourceId)) ?? match.label, status: match.status, validFrom: match.validFrom, validTo: match.validTo, isDemo: match.isDemo };
}

export interface QuoteRunView {
  runId: string;
  vehicleLabel: string;
  model: string;
  version: string;
  downPayment: number;
  termMonths: number;
  result: QuoteV2Result;
  program: { name: string; lender: string; status: ProgramCalibrationStatus; validTo: Date | null } | null;
  /** Corrida validada guardada que coincide EXACTO con el escenario (Sprint 2), si existe. */
  validatedExample: { name: string; monthlyPayment: number; isDemo: boolean } | null;
}

export async function runQuote(
  app: AppContext,
  input: { model: string; version: string | null; downPayment: number; termMonths: number; customerId?: string | null },
  actor: "mario" | "sofia" = "mario",
): Promise<QuoteRunView> {
  const now = app.clock.now();
  const cat = await loadCatalog(app.db, app.workspaceId);
  const vehicle = findVehicle(cat, input.model);
  if (!vehicle) throw new ServiceError(`No tengo registrado el modelo ${input.model}.`, 404);
  const versions = cat.versions.filter((v) => v.vehicleId === vehicle.id);
  const version = input.version ? findVersion(cat, vehicle.id, input.version) : versions.length === 1 ? versions[0]! : null;
  if (!version) {
    throw new ServiceError(
      input.version
        ? `No tengo la versión ${input.version} de ${vehicle.model}. Versiones registradas: ${versions.map((v) => v.name).join(", ")}.`
        : `¿Qué versión de ${vehicle.model}? ${versions.map((v) => v.name).join(", ")}.`,
      404,
    );
  }
  if (!(input.downPayment >= 0) || !(input.termMonths > 0)) throw new ServiceError("Enganche o plazo inválido.");
  const label = `${vehicle.model} ${version.name}`;
  const price = await pickPrice(app, cat, version.id, now);
  const bonusRes = resolveBonusFor(cat, { vehicleId: vehicle.id, versionId: version.id, paymentMethod: "financing", downPayment: input.downPayment, termMonths: input.termMonths, vehiclePrice: price?.amount ?? null, now });
  const offer = bonusRes.offerId ? cat.offers.find((o) => o.id === bonusRes.offerId) : undefined;
  const bonus: SourcedAmount | null =
    bonusRes.amount > 0 && offer
      ? { amount: bonusRes.amount, sourceLabel: (await sourceName(app.db, offer.sourceId)) ?? offer.title, status: bonusRes.status, validFrom: offer.validFrom, validTo: offer.validTo, isDemo: offer.isDemo }
      : null;
  const program = await pickProgram(app, vehicle.model, version.name, now);
  const insurance = await pickInsurance(app, vehicle.model, version.name, input.termMonths, now);
  const result = computeQuoteV2({ modelLabel: label, downPayment: input.downPayment, termMonths: input.termMonths, price, bonus, program, insurance, extras: [], now });

  let validatedExample: QuoteRunView["validatedExample"] = null;
  if (result.exactness !== "exact") {
    const found = await lookupScenario(app, { model: vehicle.model, version: version.name, downPayment: input.downPayment, termMonths: input.termMonths }).catch(() => null);
    if (found?.validated) validatedExample = { name: found.validated.name, monthlyPayment: found.validated.monthlyPayment, isDemo: found.validated.isDemo };
  }

  const [run] = await app.db
    .insert(s.quoteRuns)
    .values({
      workspaceId: app.workspaceId,
      customerId: input.customerId ?? null,
      versionId: version.id,
      programId: program?.id ?? null,
      vehicleLabel: label,
      downPayment: input.downPayment,
      termMonths: input.termMonths,
      exactness: result.exactness,
      monthlyPayment: result.monthlyPayment,
      components: result.components as unknown as Array<Record<string, unknown>>,
      missing: result.missing,
      isDemo: result.isDemo,
      createdBy: actor,
    })
    .returning();
  return {
    runId: run!.id,
    vehicleLabel: label,
    model: vehicle.model,
    version: version.name,
    downPayment: input.downPayment,
    termMonths: input.termMonths,
    result,
    program: program ? { name: program.name, lender: program.lender, status: program.calibrationStatus, validTo: program.validTo } : null,
    validatedExample,
  };
}

/** Guarda la corrida; si se asigna a un cliente, queda también en sus cotizaciones (continuidad con ventas). */
export async function saveQuoteRun(app: AppContext, runId: string, customerId: string | null) {
  const [run] = await app.db.select().from(s.quoteRuns).where(and(eq(s.quoteRuns.id, runId), eq(s.quoteRuns.workspaceId, app.workspaceId)));
  if (!run) throw new ServiceError("Corrida no encontrada.", 404);
  if (run.exactness === "incomplete") throw new ServiceError("Una corrida incompleta no se guarda como cotización.", 409);
  let quoteId: string | null = null;
  if (customerId) {
    const [version] = run.versionId ? await app.db.select().from(s.vehicleVersions).where(eq(s.vehicleVersions.id, run.versionId)) : [];
    const amount = (key: string) => (run.components.find((c) => c.key === key)?.amount as number | null | undefined) ?? null;
    const [q] = await app.db
      .insert(s.quotes)
      .values({
        workspaceId: app.workspaceId,
        customerId,
        vehicleId: version?.vehicleId ?? null,
        versionId: run.versionId,
        // Solo una corrida de un programa VALIDADO cuenta como corrida validada; lo demás es estimación.
        calculationType: run.exactness === "exact" ? "validated_template" : "estimate",
        status: "presented",
        vehiclePrice: amount("vehicle_price") ?? 0,
        downPayment: run.downPayment,
        termMonths: run.termMonths,
        monthlyPayment: run.monthlyPayment,
        annualRate: amount("annual_rate"),
        bonus: amount("bonus") ?? 0,
        openingCommission: amount("opening_commission"),
        insurance: amount("insurance"),
        quoteRunId: run.id,
        calculationTrace: [`Cotizador V2 · ${run.exactness}`],
        createdBy: "mario",
        isDemo: run.isDemo,
      })
      .returning();
    quoteId = q!.id;
    await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "quote_run_saved", entityType: "quote_run", entityId: run.id, customerId, data: { exactness: run.exactness } });
  }
  await app.db.update(s.quoteRuns).set({ saved: true, customerId: customerId ?? run.customerId }).where(eq(s.quoteRuns.id, run.id));
  return { quoteId };
}

export async function listQuoteRuns(app: AppContext, opts: { customerId?: string; savedOnly?: boolean; limit?: number } = {}) {
  const conds = [eq(s.quoteRuns.workspaceId, app.workspaceId)];
  if (opts.customerId) conds.push(eq(s.quoteRuns.customerId, opts.customerId));
  if (opts.savedOnly) conds.push(eq(s.quoteRuns.saved, true));
  return app.db.select().from(s.quoteRuns).where(and(...conds)).orderBy(desc(s.quoteRuns.createdAt)).limit(opts.limit ?? 20);
}

/** Calibra un programa contra sus corridas reales y guarda el reporte (sin ajustar nada). */
export async function calibrateFinanceProgram(app: AppContext, programId: string) {
  const [p] = await app.db.select().from(s.financePrograms).where(and(eq(s.financePrograms.id, programId), eq(s.financePrograms.workspaceId, app.workspaceId)));
  if (!p) throw new ServiceError("Programa no encontrado.", 404);
  const terms = await app.db.select().from(s.financeTerms).where(eq(s.financeTerms.programId, p.id));
  const examples = await app.db.select().from(s.validatedQuoteExamples).where(eq(s.validatedQuoteExamples.programId, p.id));
  const report = calibrateProgram(
    toProgramSpec(p, terms, p.name),
    examples.map((e) => ({ id: e.id, label: e.label, downPayment: e.downPayment, termMonths: e.termMonths, vehiclePrice: e.vehiclePrice, bonus: e.bonus, insurance: e.insurance, expected: e.expected })),
    app.clock.now(),
  );
  await app.db
    .update(s.financePrograms)
    .set({ calibrationStatus: report.status, calibrationReport: report as unknown as Record<string, unknown>, calibratedAt: app.clock.now(), updatedAt: app.clock.now() })
    .where(eq(s.financePrograms.id, p.id));
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "system", eventType: "finance_program_calibrated", entityType: "finance_program", entityId: p.id, data: { status: report.status, summary: report.summary } });
  return report;
}

export async function listProgramsWithStatus(app: AppContext) {
  const rows = await app.db.select().from(s.financePrograms).where(eq(s.financePrograms.workspaceId, app.workspaceId));
  const examples = await app.db.select({ programId: s.validatedQuoteExamples.programId }).from(s.validatedQuoteExamples).where(eq(s.validatedQuoteExamples.workspaceId, app.workspaceId));
  return rows.map((p) => ({ ...p, exampleCount: examples.filter((e) => e.programId === p.id).length }));
}
