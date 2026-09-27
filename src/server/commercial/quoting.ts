/**
 * Adaptador entre filas de BD y el motor de cotización/bono (dominio puro).
 */
import { resolveBonus, type BonusResolution } from "@/domain/bonus";
import { effectiveStatus, matchesScope } from "@/domain/knowledge";
import { calculateQuote, pickFinancingRule, type ComputedQuote, type FinancingRuleLike, type QuoteFailureReason } from "@/domain/quote-engine";
import { findVehicle, findVersion, type CatalogSnapshot, type FinancingRow, type OfferRow } from "./catalog";

export interface QuoteInput {
  model: string;
  version: string;
  downPayment: number;
  termMonths: number | null;
  paymentMethod: "cash" | "financing" | "undecided" | null;
}

export type QuoteComputation =
  | {
      ok: true;
      model: string;
      version: string;
      vehicleId: string;
      versionId: string;
      quote: ComputedQuote;
      bonus: BonusResolution;
      isDemo: boolean;
    }
  | { ok: false; model: string; version: string; reason: QuoteFailureReason | "unknown_vehicle" | "unknown_version"; message: string };

export function toFinancingLike(r: FinancingRow): FinancingRuleLike {
  return {
    id: r.id,
    lender: r.lender,
    productName: r.productName,
    annualRate: r.annualRate,
    allowedTerms: r.allowedTerms,
    minDownPaymentPct: r.minDownPaymentPct,
    openingCommissionPct: r.openingCommissionPct,
    requiresInsurance: r.requiresInsurance,
    status: r.status,
    validFrom: r.validFrom,
    validTo: r.validTo,
  };
}

/** Precio de lista de una versión: el vigente si existe; si no, el más reciente (para reportar que no está vigente). */
export function pickListPrice(cat: CatalogSnapshot, versionId: string, now: Date): OfferRow | null {
  const prices = cat.offers.filter((o) => o.offerType === "list_price" && o.versionId === versionId && o.amount !== null);
  const current = prices.filter((p) => effectiveStatus(p, now).presentableAsCurrent);
  const pool = current.length ? current : prices;
  pool.sort((a, b) => (b.validFrom?.getTime() ?? 0) - (a.validFrom?.getTime() ?? 0));
  return pool[0] ?? null;
}

export function resolveBonusFor(
  cat: CatalogSnapshot,
  args: { vehicleId: string; versionId: string | null; paymentMethod: QuoteInput["paymentMethod"]; downPayment: number | null; termMonths: number | null; vehiclePrice: number | null; now: Date },
): BonusResolution {
  const lender = args.paymentMethod === "financing" ? (pickFinancingRule(cat.financing.map(toFinancingLike), args.now)?.lender ?? null) : null;
  const offers = cat.offers
    .filter((o) => o.offerType === "bonus")
    .map((o) => ({ id: o.id, title: o.title, vehicleId: o.vehicleId, versionId: o.versionId, amount: o.amount, status: o.status, validFrom: o.validFrom, validTo: o.validTo }));
  const rules = cat.rules.map((r) => ({
    id: r.id,
    offerId: r.offerId,
    ruleType: r.ruleType,
    name: r.name,
    condition: r.condition,
    effect: r.effect,
    priority: r.priority,
    status: r.status,
    validFrom: r.validFrom,
    validTo: r.validTo,
  }));
  return resolveBonus(offers, rules, {
    vehicleId: args.vehicleId,
    versionId: args.versionId,
    paymentMethod: args.paymentMethod,
    lender,
    termMonths: args.termMonths,
    downPayment: args.downPayment,
    vehiclePrice: args.vehiclePrice,
    now: args.now,
  });
}

export function computeQuote(cat: CatalogSnapshot, input: QuoteInput, now: Date): QuoteComputation {
  const vehicle = findVehicle(cat, input.model);
  if (!vehicle) return { ok: false, model: input.model, version: input.version, reason: "unknown_vehicle", message: `No tengo registrado el modelo ${input.model}.` };
  const version = findVersion(cat, vehicle.id, input.version);
  if (!version) {
    return { ok: false, model: vehicle.model, version: input.version, reason: "unknown_version", message: `No tengo registrada la versión ${input.version} de ${vehicle.model}.` };
  }
  const priceRow = pickListPrice(cat, version.id, now);
  const paymentMethod = input.paymentMethod === "cash" ? "cash" : "financing";
  const bonus = resolveBonusFor(cat, {
    vehicleId: vehicle.id,
    versionId: version.id,
    paymentMethod,
    downPayment: input.downPayment,
    termMonths: input.termMonths,
    vehiclePrice: priceRow?.amount ?? null,
    now,
  });
  const result = calculateQuote({
    versionId: version.id,
    price: priceRow
      ? { offerId: priceRow.id, title: priceRow.title, amount: priceRow.amount!, status: priceRow.status, validFrom: priceRow.validFrom, validTo: priceRow.validTo }
      : null,
    bonus,
    downPayment: input.downPayment,
    termMonths: input.termMonths,
    paymentMethod,
    financing: cat.financing.map(toFinancingLike),
    insurance: cat.insurance
      .filter((i) => matchesScope(i, vehicle.model, version.name))
      .map((i) => ({ id: i.id, insurer: i.insurer, coverage: i.coverage, annualPremium: i.annualPremium, pctOfVehiclePrice: i.pctOfVehiclePrice, status: i.status, validFrom: i.validFrom, validTo: i.validTo })),
    templates: cat.templates
      .filter((t) => t.versionId === version.id)
      .map((t) => ({
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
      })),
    now,
  });
  if (!result.ok) return { ok: false, model: vehicle.model, version: version.name, reason: result.reason, message: result.message };
  return {
    ok: true,
    model: vehicle.model,
    version: version.name,
    vehicleId: vehicle.id,
    versionId: version.id,
    quote: result.quote,
    bonus,
    isDemo: Boolean(priceRow?.isDemo),
  };
}
