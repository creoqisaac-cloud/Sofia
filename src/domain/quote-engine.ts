/**
 * Motor de cotización determinista.
 *
 * - Sofía NUNCA genera cotizaciones oficiales: solo `estimate` (cálculo propio
 *   con reglas vigentes) o `validated_template` (una corrida real previamente
 *   validada que coincide exactamente con lo solicitado).
 * - Las cotizaciones oficiales solo las registra Mario (ver restricción en BD).
 * - Si falta un dato vigente (precio, tasa), no se calcula: se reporta.
 */
import type { BonusResolution } from "./bonus";
import type { InfoStatus } from "./enums";
import { effectiveStatus, type KnowledgeMetaLike } from "./knowledge";
import { amountsMatch, formatMXN, roundMoney } from "./money";

export interface PriceInfo extends KnowledgeMetaLike {
  offerId: string;
  title: string;
  amount: number;
}

export interface FinancingRuleLike extends KnowledgeMetaLike {
  id: string;
  lender: string;
  productName: string;
  annualRate: number;
  allowedTerms: number[];
  minDownPaymentPct: number;
  openingCommissionPct: number;
  requiresInsurance: boolean;
}

export interface InsuranceRuleLike extends KnowledgeMetaLike {
  id: string;
  insurer: string;
  coverage: string;
  annualPremium: number | null;
  pctOfVehiclePrice: number | null;
}

export interface QuoteTemplateLike extends KnowledgeMetaLike {
  id: string;
  name: string;
  versionId: string;
  financingRuleId: string | null;
  vehiclePrice: number;
  downPayment: number;
  termMonths: number;
  monthlyPayment: number;
  annualRate: number | null;
  bonus: number;
  openingCommission: number | null;
  insurance: number | null;
  plates: number | null;
  otherConcepts: Array<{ label: string; amount: number }>;
  conditions: string | null;
}

export interface QuoteRequest {
  versionId: string;
  price: PriceInfo | null;
  bonus: BonusResolution;
  downPayment: number;
  termMonths: number | null;
  paymentMethod: "cash" | "financing" | "undecided" | null;
  financing: FinancingRuleLike[];
  insurance: InsuranceRuleLike[];
  templates: QuoteTemplateLike[];
  now: Date;
}

export interface ComputedQuote {
  calculationType: "validated_template" | "estimate";
  vehiclePrice: number;
  downPayment: number;
  termMonths: number | null;
  monthlyPayment: number | null;
  annualRate: number | null;
  bonus: number;
  bonusOfferId: string | null;
  amountFinanced: number | null;
  openingCommission: number | null;
  insurance: number | null;
  plates: number | null;
  otherConcepts: Array<{ label: string; amount: number }>;
  conditions: string;
  validUntil: Date | null;
  templateId: string | null;
  financingRuleId: string | null;
  componentStatuses: Record<string, InfoStatus>;
  trace: string[];
}

export type QuoteFailureReason =
  | "no_price"
  | "price_not_current"
  | "no_financing_rule"
  | "down_payment_below_minimum"
  | "term_not_allowed"
  | "down_payment_exceeds_price";

export type QuoteResult =
  | { ok: true; quote: ComputedQuote }
  | { ok: false; reason: QuoteFailureReason; message: string; trace: string[] };

const DEFAULT_TERM = 48;

export function monthlyPayment(principal: number, annualRate: number, months: number): number {
  if (principal <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return roundMoney(principal / months);
  return roundMoney((principal * r) / (1 - Math.pow(1 + r, -months)));
}

function earliest(dates: Array<Date | null>): Date | null {
  const valid = dates.filter((d): d is Date => d !== null);
  if (valid.length === 0) return null;
  return new Date(Math.min(...valid.map((d) => d.getTime())));
}

export function pickFinancingRule(rules: FinancingRuleLike[], now: Date): FinancingRuleLike | null {
  const current = rules.filter((r) => effectiveStatus(r, now).presentableAsCurrent);
  // Preferimos reglas confirmadas sobre estimadas.
  current.sort((a, b) => Number(b.status === "confirmed") - Number(a.status === "confirmed"));
  return current[0] ?? null;
}

export function calculateQuote(req: QuoteRequest): QuoteResult {
  const trace: string[] = [];
  if (!req.price) return { ok: false, reason: "no_price", message: "No hay precio registrado para esta versión.", trace };
  const priceStatus = effectiveStatus(req.price, req.now);
  if (!priceStatus.presentableAsCurrent) {
    return {
      ok: false,
      reason: "price_not_current",
      message: "El precio registrado no está vigente; hay que confirmarlo antes de cotizar.",
      trace: [`Precio "${req.price.title}" con estatus ${priceStatus.status}.`],
    };
  }
  const vehiclePrice = req.price.amount;
  const bonus = req.bonus.amount;
  const netPrice = vehiclePrice - bonus;
  trace.push(`Precio ${vehiclePrice} (${priceStatus.status}); bono ${bonus} (${req.bonus.status}); precio neto ${netPrice}.`);
  trace.push(...req.bonus.trace);

  const componentStatuses: Record<string, InfoStatus> = { price: priceStatus.status, bonus: req.bonus.status };

  if (req.paymentMethod === "cash") {
    return {
      ok: true,
      quote: {
        calculationType: "estimate",
        vehiclePrice,
        downPayment: req.downPayment,
        termMonths: null,
        monthlyPayment: null,
        annualRate: null,
        bonus,
        bonusOfferId: req.bonus.offerId,
        amountFinanced: null,
        openingCommission: null,
        insurance: null,
        plates: null,
        otherConcepts: [],
        conditions: "Estimación de contado. No incluye placas, tenencia ni seguro. Sujeta a confirmación de Mario.",
        validUntil: earliest([req.price.validTo]),
        templateId: null,
        financingRuleId: null,
        componentStatuses,
        trace: [...trace, `Pago de contado estimado: ${netPrice}.`],
      },
    };
  }

  if (req.downPayment >= netPrice) {
    return {
      ok: false,
      reason: "down_payment_exceeds_price",
      message: "El enganche cubre el precio neto; conviene cotizar de contado.",
      trace,
    };
  }

  // 1) ¿Existe una corrida previamente validada que coincida EXACTAMENTE?
  const term = req.termMonths ?? null;
  for (const t of req.templates) {
    if (t.versionId !== req.versionId) continue;
    const eff = effectiveStatus(t, req.now);
    if (!eff.presentableAsCurrent || eff.status !== "validated_quote") {
      trace.push(`Plantilla "${t.name}" descartada: estatus ${eff.status}.`);
      continue;
    }
    const termMatches = term === null ? t.termMonths === DEFAULT_TERM : t.termMonths === term;
    // Coincidencia exacta de enganche (±1 peso) y plazo: una corrida validada no se extrapola.
    if (Math.abs(t.downPayment - req.downPayment) > 1 || !termMatches) continue;
    if (!amountsMatch(t.vehiclePrice, vehiclePrice) || !amountsMatch(t.bonus, bonus)) {
      trace.push(`Plantilla "${t.name}" descartada: precio o bono ya no coinciden con los vigentes.`);
      continue;
    }
    trace.push(`Coincide con plantilla validada "${t.name}".`);
    return {
      ok: true,
      quote: {
        calculationType: "validated_template",
        vehiclePrice: t.vehiclePrice,
        downPayment: t.downPayment,
        termMonths: t.termMonths,
        monthlyPayment: t.monthlyPayment,
        annualRate: t.annualRate,
        bonus: t.bonus,
        bonusOfferId: req.bonus.offerId,
        amountFinanced: roundMoney(t.vehiclePrice - t.bonus - t.downPayment),
        openingCommission: t.openingCommission,
        insurance: t.insurance,
        plates: t.plates,
        otherConcepts: t.otherConcepts,
        conditions: t.conditions ?? "Corrida previamente validada. Sujeta a aprobación de crédito.",
        validUntil: earliest([t.validTo, req.price.validTo]),
        templateId: t.id,
        financingRuleId: t.financingRuleId,
        componentStatuses: { ...componentStatuses, quote: "validated_quote" },
        trace,
      },
    };
  }

  // 2) Estimación con regla de financiamiento vigente.
  const rule = pickFinancingRule(req.financing, req.now);
  if (!rule) {
    return { ok: false, reason: "no_financing_rule", message: "No hay tasa de financiamiento vigente registrada.", trace };
  }
  const rateStatus = effectiveStatus(rule, req.now).status;
  componentStatuses.rate = rateStatus;
  const minDown = roundMoney(netPrice * rule.minDownPaymentPct);
  if (req.downPayment < minDown) {
    return {
      ok: false,
      reason: "down_payment_below_minimum",
      message: `El enganche mínimo con ${rule.lender} es ${Math.round(rule.minDownPaymentPct * 100)}% (${formatMXN(minDown)}).`,
      trace: [...trace, `Enganche ${req.downPayment} < mínimo ${minDown}.`],
    };
  }
  let months = term ?? (rule.allowedTerms.includes(DEFAULT_TERM) ? DEFAULT_TERM : Math.max(...rule.allowedTerms));
  if (!rule.allowedTerms.includes(months)) {
    return {
      ok: false,
      reason: "term_not_allowed",
      message: `Plazos disponibles con ${rule.lender}: ${rule.allowedTerms.join(", ")} meses.`,
      trace,
    };
  }
  months = Math.round(months);
  const financed = roundMoney(netPrice - req.downPayment);
  const monthly = monthlyPayment(financed, rule.annualRate, months);
  const opening = roundMoney(financed * rule.openingCommissionPct);
  trace.push(
    `Financiado ${financed} a ${months} meses, tasa anual ${rule.annualRate} (${rateStatus}) → mensualidad ${monthly}; comisión apertura ${opening}.`,
  );

  let insurance: number | null = null;
  const ins = req.insurance.find((i) => effectiveStatus(i, req.now).presentableAsCurrent);
  if (ins) {
    insurance = ins.annualPremium ?? (ins.pctOfVehiclePrice ? roundMoney(vehiclePrice * ins.pctOfVehiclePrice) : null);
    componentStatuses.insurance = effectiveStatus(ins, req.now).status;
    trace.push(`Seguro anual estimado ${insurance} (${ins.insurer}, ${componentStatuses.insurance}).`);
  } else {
    componentStatuses.insurance = "unknown";
    trace.push("Sin regla de seguro vigente: el seguro queda por confirmar.");
  }

  return {
    ok: true,
    quote: {
      calculationType: "estimate",
      vehiclePrice,
      downPayment: req.downPayment,
      termMonths: months,
      monthlyPayment: monthly,
      annualRate: rule.annualRate,
      bonus,
      bonusOfferId: req.bonus.offerId,
      amountFinanced: financed,
      openingCommission: opening,
      insurance,
      plates: null,
      otherConcepts: [],
      conditions:
        "ESTIMACIÓN: mensualidad sin IVA de intereses; no incluye placas ni tenencia. Sujeta a aprobación de crédito y a confirmación de Mario.",
      validUntil: earliest([req.price.validTo, rule.validTo]),
      templateId: null,
      financingRuleId: rule.id,
      componentStatuses,
      trace,
    },
  };
}

/**
 * Memoria comercial: recupera una corrida previamente validada SOLO si el escenario
 * coincide exactamente (versión, enganche ±1 peso, plazo) y sigue vigente.
 * Nunca interpola ni ajusta una corrida para otro enganche/plazo.
 */
export function findExactValidatedTemplate(
  templates: QuoteTemplateLike[],
  scenario: { versionId: string; downPayment: number; termMonths: number },
  now: Date,
): { template: QuoteTemplateLike; reason: "match" } | { template: null; reason: "no_exact_scenario" | "only_historical" } {
  const sameScenario = templates.filter(
    (t) => t.versionId === scenario.versionId && Math.abs(t.downPayment - scenario.downPayment) <= 1 && t.termMonths === scenario.termMonths,
  );
  const current = sameScenario.find((t) => {
    const eff = effectiveStatus(t, now);
    return eff.presentableAsCurrent && eff.status === "validated_quote";
  });
  if (current) return { template: current, reason: "match" };
  return { template: null, reason: sameScenario.length ? "only_historical" : "no_exact_scenario" };
}
