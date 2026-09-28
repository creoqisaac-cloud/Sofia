/**
 * Cotizaciones del cliente y memoria de corridas validadas ("acordarse").
 * Una cotización NO es una venta: la venta es otra entidad que puede referenciarla.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { effectiveStatus } from "@/domain/knowledge";
import { findExactValidatedTemplate, type QuoteTemplateLike } from "@/domain/quote-engine";
import type { AppContext } from "../app";
import { findVehicle, findVersion, loadCatalog } from "../commercial/catalog";
import { computeQuote } from "../commercial/quoting";
import * as s from "../db/schema";
import { ServiceError } from "./errors";

export const NO_VALIDATED_SCENARIO = "No existe una corrida validada para este escenario.";

function toTemplateLike(t: typeof s.quoteTemplates.$inferSelect): QuoteTemplateLike {
  return {
    id: t.id,
    name: t.name,
    versionId: t.versionId,
    financingRuleId: t.financingRuleId,
    vehiclePrice: t.vehiclePrice,
    downPayment: t.downPayment,
    termMonths: t.termMonths,
    monthlyPayment: t.monthlyPayment,
    annualRate: t.annualRate,
    bonus: t.bonus,
    openingCommission: t.openingCommission,
    insurance: t.insurance,
    plates: t.plates,
    otherConcepts: t.otherConcepts,
    conditions: t.conditions,
    status: t.status,
    validFrom: t.validFrom,
    validTo: t.validTo,
  };
}

export async function listCustomerQuotes(app: AppContext, customerId: string) {
  const now = app.clock.now();
  const [quotes, catalog, sales] = await Promise.all([
    app.db.select().from(s.quotes).where(and(eq(s.quotes.customerId, customerId), eq(s.quotes.workspaceId, app.workspaceId))).orderBy(desc(s.quotes.createdAt)),
    loadCatalog(app.db, app.workspaceId),
    app.db.select({ id: s.saleRecords.id, quoteId: s.saleRecords.quoteId }).from(s.saleRecords).where(eq(s.saleRecords.customerId, customerId)),
  ]);
  return quotes.map((q) => {
    const vehicle = catalog.vehicles.find((v) => v.id === q.vehicleId);
    const version = catalog.versions.find((v) => v.id === q.versionId);
    const expired = q.validUntil !== null && q.validUntil.getTime() < now.getTime();
    return {
      ...q,
      vehicleLabel: [vehicle?.model, version?.name].filter(Boolean).join(" ") || "Vehículo",
      expired,
      /** Una cotización vencida es histórica: nunca se presenta como vigente. */
      effectiveLabel: expired ? "Histórica (vencida)" : q.calculationType === "official" ? "Oficial" : q.calculationType === "validated_template" ? "Corrida validada" : "Estimación",
      saleId: sales.find((sl) => sl.quoteId === q.id)?.id ?? null,
    };
  });
}

export async function lookupScenario(app: AppContext, input: { model: string; version: string; downPayment: number; termMonths: number }) {
  const catalog = await loadCatalog(app.db, app.workspaceId);
  const vehicle = findVehicle(catalog, input.model);
  const version = vehicle ? findVersion(catalog, vehicle.id, input.version) : null;
  if (!vehicle || !version) throw new ServiceError("Modelo o versión no registrados.");
  const now = app.clock.now();
  const found = findExactValidatedTemplate(catalog.templates.map(toTemplateLike), { versionId: version.id, downPayment: input.downPayment, termMonths: input.termMonths }, now);
  const row = found.template ? catalog.templates.find((t) => t.id === found.template!.id)! : null;
  // La estimación es otra cosa y siempre va etiquetada como tal.
  const estimate = computeQuote(catalog, { model: vehicle.model, version: version.name, downPayment: input.downPayment, termMonths: input.termMonths, paymentMethod: "financing" }, now);
  return {
    model: vehicle.model,
    version: version.name,
    validated: row ? { id: row.id, name: row.name, monthlyPayment: row.monthlyPayment, bonus: row.bonus, vehiclePrice: row.vehiclePrice, downPayment: row.downPayment, termMonths: row.termMonths, validTo: row.validTo, isDemo: row.isDemo } : null,
    message: row ? null : found.reason === "only_historical" ? "La corrida validada para este escenario ya venció; no se presenta como vigente." : NO_VALIDATED_SCENARIO,
    estimate: estimate.ok ? { monthlyPayment: estimate.quote.monthlyPayment, bonus: estimate.quote.bonus, calculationType: estimate.quote.calculationType } : null,
  };
}

/** Mario guarda para el cliente una corrida validada existente. */
export async function attachValidatedQuote(app: AppContext, customerId: string, templateId: string) {
  const [tpl] = await app.db.select().from(s.quoteTemplates).where(and(eq(s.quoteTemplates.id, templateId), eq(s.quoteTemplates.workspaceId, app.workspaceId)));
  if (!tpl) throw new ServiceError("Corrida no encontrada.", 404);
  const eff = effectiveStatus(tpl, app.clock.now());
  if (!eff.presentableAsCurrent || eff.status !== "validated_quote") throw new ServiceError("Esa corrida no está vigente.", 409);
  const [q] = await app.db
    .insert(s.quotes)
    .values({
      workspaceId: app.workspaceId,
      customerId,
      vehicleId: tpl.vehicleId,
      versionId: tpl.versionId,
      calculationType: "validated_template",
      status: "presented",
      vehiclePrice: tpl.vehiclePrice,
      downPayment: tpl.downPayment,
      termMonths: tpl.termMonths,
      monthlyPayment: tpl.monthlyPayment,
      annualRate: tpl.annualRate,
      bonus: tpl.bonus,
      openingCommission: tpl.openingCommission,
      insurance: tpl.insurance,
      plates: tpl.plates,
      otherConcepts: tpl.otherConcepts,
      conditions: tpl.conditions,
      validUntil: tpl.validTo,
      templateId: tpl.id,
      financingRuleId: tpl.financingRuleId,
      calculationTrace: [`Corrida validada recuperada: ${tpl.name}.`],
      createdBy: "mario",
      isDemo: tpl.isDemo,
    })
    .returning();
  return q!;
}

/** Mario registra una corrida que él ya validó (queda como memoria comercial reutilizable). */
export async function registerValidatedScenario(
  app: AppContext,
  input: {
    model: string;
    version: string;
    vehiclePrice: number;
    bonus: number;
    downPayment: number;
    termMonths: number;
    monthlyPayment: number;
    annualRate?: number | null;
    openingCommission?: number | null;
    insurance?: number | null;
    conditions?: string | null;
    validTo: Date;
    sourceName: string;
  },
) {
  const catalog = await loadCatalog(app.db, app.workspaceId);
  const vehicle = findVehicle(catalog, input.model);
  const version = vehicle ? findVersion(catalog, vehicle.id, input.version) : null;
  if (!vehicle || !version) throw new ServiceError("Modelo o versión no registrados.");
  const [src] = await app.db
    .insert(s.knowledgeSources)
    .values({ workspaceId: app.workspaceId, name: input.sourceName, sourceType: "mario_manual", receivedAt: new Date() })
    .returning();
  const [tpl] = await app.db
    .insert(s.quoteTemplates)
    .values({
      workspaceId: app.workspaceId,
      name: `${vehicle.model} ${version.name} · enganche ${input.downPayment} · ${input.termMonths} meses`,
      vehicleId: vehicle.id,
      versionId: version.id,
      vehiclePrice: input.vehiclePrice,
      downPayment: input.downPayment,
      termMonths: input.termMonths,
      monthlyPayment: input.monthlyPayment,
      annualRate: input.annualRate ?? null,
      bonus: input.bonus,
      openingCommission: input.openingCommission ?? null,
      insurance: input.insurance ?? null,
      conditions: input.conditions ?? "Corrida validada por Mario.",
      status: "validated_quote",
      sourceId: src!.id,
      sourceType: "mario_manual",
      validFrom: app.clock.now(),
      validTo: input.validTo,
      modelScope: [vehicle.model],
      versionScope: [version.name],
    })
    .returning();
  return tpl!;
}

export async function quotesByIds(app: AppContext, ids: string[]) {
  if (!ids.length) return [];
  return app.db.select().from(s.quotes).where(inArray(s.quotes.id, ids));
}
