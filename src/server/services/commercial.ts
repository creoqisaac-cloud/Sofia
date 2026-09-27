/**
 * Vista y pruebas de reglas comerciales (pantalla "Reglas comerciales").
 */
import type { InfoStatus } from "@/domain/enums";
import { effectiveStatus } from "@/domain/knowledge";
import type { AppContext } from "../app";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { findVehicle, loadCatalog } from "../commercial/catalog";
import { computeQuote, type QuoteInput } from "../commercial/quoting";
import { ServiceError } from "./customers";

export async function getCommercialOverview(app: AppContext) {
  const now = app.clock.now();
  const cat = await loadCatalog(app.db, app.workspaceId);
  const src = (id: string | null) => (id ? (cat.sources.get(id)?.name ?? null) : null);
  const vehicleName = (id: string | null) => cat.vehicles.find((v) => v.id === id)?.model ?? "Todos";
  const versionName = (id: string | null) => cat.versions.find((v) => v.id === id)?.name ?? null;
  const meta = (row: { status: InfoStatus; validFrom: Date | null; validTo: Date | null; sourceId: string | null; isDemo: boolean; notes: string | null }) => {
    const eff = effectiveStatus(row, now);
    return {
      storedStatus: row.status,
      effectiveStatus: eff.status,
      expired: eff.expired,
      notYetValid: eff.notYetValid,
      validFrom: row.validFrom,
      validTo: row.validTo,
      source: src(row.sourceId),
      isDemo: row.isDemo,
      notes: row.notes,
    };
  };
  return {
    now,
    vehicles: cat.vehicles.map((v) => ({
      id: v.id,
      model: v.model,
      modelYear: v.modelYear,
      isDemo: v.isDemo,
      versions: cat.versions.filter((x) => x.vehicleId === v.id).map((x) => ({ id: x.id, name: x.name, powertrain: x.powertrain })),
    })),
    offers: cat.offers.map((o) => ({ id: o.id, type: o.offerType, title: o.title, amount: o.amount, vehicle: vehicleName(o.vehicleId), version: versionName(o.versionId), conditions: o.conditions, ...meta(o) })),
    rules: cat.rules.map((r) => ({ id: r.id, name: r.name, ruleType: r.ruleType, condition: r.condition, effect: r.effect, ...meta(r) })),
    financing: cat.financing.map((f) => ({ id: f.id, lender: f.lender, product: f.productName, annualRate: f.annualRate, allowedTerms: f.allowedTerms, minDownPaymentPct: f.minDownPaymentPct, openingCommissionPct: f.openingCommissionPct, ...meta(f) })),
    insurance: cat.insurance.map((i) => ({ id: i.id, insurer: i.insurer, coverage: i.coverage, annualPremium: i.annualPremium, pctOfVehiclePrice: i.pctOfVehiclePrice, ...meta(i) })),
    templates: cat.templates.map((t) => ({ id: t.id, name: t.name, downPayment: t.downPayment, termMonths: t.termMonths, monthlyPayment: t.monthlyPayment, ...meta(t) })),
    knowledge: cat.knowledge.map((k) => ({ id: k.id, category: k.category, title: k.title, content: k.content, ...meta(k) })),
  };
}

export async function previewQuote(app: AppContext, input: QuoteInput) {
  const cat = await loadCatalog(app.db, app.workspaceId);
  return computeQuote(cat, input, app.clock.now());
}

/**
 * Registro de una cotización OFICIAL. Solo Mario puede hacerlo y siempre con
 * fuente (documento oficial). La BD lo exige con una restricción CHECK.
 */
export async function registerOfficialQuote(
  app: AppContext,
  input: {
    customerId: string;
    model: string;
    version: string;
    vehiclePrice: number;
    downPayment: number;
    termMonths: number;
    monthlyPayment: number;
    annualRate: number | null;
    bonus: number;
    validUntil: Date;
    sourceName: string;
    sourceReference: string | null;
  },
) {
  const cat = await loadCatalog(app.db, app.workspaceId);
  const vehicle = findVehicle(cat, input.model);
  const version = vehicle ? cat.versions.find((v) => v.vehicleId === vehicle.id && v.name.toLowerCase() === input.version.toLowerCase()) : null;
  if (!vehicle || !version) throw new ServiceError("Modelo o versión no registrados.");
  return app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [source] = await tx
      .insert(s.knowledgeSources)
      .values({ workspaceId: app.workspaceId, name: input.sourceName, sourceType: "official_quote_document", reference: input.sourceReference, receivedAt: new Date() })
      .returning();
    const [quote] = await tx
      .insert(s.quotes)
      .values({
        workspaceId: app.workspaceId,
        customerId: input.customerId,
        vehicleId: vehicle.id,
        versionId: version.id,
        calculationType: "official",
        status: "presented",
        vehiclePrice: input.vehiclePrice,
        downPayment: input.downPayment,
        termMonths: input.termMonths,
        monthlyPayment: input.monthlyPayment,
        annualRate: input.annualRate,
        bonus: input.bonus,
        validUntil: input.validUntil,
        sourceId: source!.id,
        createdBy: "mario",
        calculationTrace: ["Cotización oficial registrada manualmente por Mario."],
      })
      .returning();
    return quote!;
  });
}
