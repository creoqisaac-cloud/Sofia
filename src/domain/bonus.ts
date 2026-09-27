/**
 * Resolución determinista del bono.
 *
 * REGLA CRÍTICA: un bono pertenece a una promoción/vehículo, NO al enganche.
 * Aumentar el enganche jamás desbloquea ni aumenta un bono por sí mismo.
 * El monto solo puede cambiar si existe una regla comercial EXPLÍCITA,
 * VIGENTE y con estatus vinculante (confirmed/official_quote) que lo indique.
 *
 * Cualquier condición o efecto desconocido en una regla hace que la regla
 * NO se aplique (falla cerrada).
 */
import type { InfoStatus } from "./enums";
import { effectiveStatus, isBindingRuleStatus, type KnowledgeMetaLike } from "./knowledge";

export interface BonusOffer extends KnowledgeMetaLike {
  id: string;
  title: string;
  vehicleId: string | null;
  versionId: string | null;
  amount: number | null;
}

export interface PromotionRuleLike extends KnowledgeMetaLike {
  id: string;
  offerId: string;
  ruleType: string;
  name: string;
  condition: Record<string, unknown>;
  effect: Record<string, unknown>;
  priority: number;
}

export interface BonusQuery {
  vehicleId: string;
  versionId: string | null;
  paymentMethod: "cash" | "financing" | "undecided" | null;
  lender: string | null;
  termMonths: number | null;
  /** Solo se consulta si una regla explícita lo exige. Nunca altera el bono por sí mismo. */
  downPayment: number | null;
  vehiclePrice: number | null;
  now: Date;
}

export interface BonusResolution {
  amount: number;
  status: InfoStatus;
  offerId: string | null;
  offerTitle: string | null;
  appliedRuleIds: string[];
  trace: string[];
}

const KNOWN_CONDITIONS = new Set([
  "payment_method",
  "lender",
  "min_term_months",
  "max_term_months",
  "min_down_payment_pct",
  "min_down_payment_amount",
]);
const KNOWN_EFFECTS = new Set(["set_bonus_amount", "add_bonus_amount"]);

function conditionMatches(condition: Record<string, unknown>, q: BonusQuery): { ok: boolean; why: string } {
  for (const [key, expected] of Object.entries(condition)) {
    if (!KNOWN_CONDITIONS.has(key)) return { ok: false, why: `condición desconocida "${key}"` };
    switch (key) {
      case "payment_method":
        if (q.paymentMethod !== expected) return { ok: false, why: `forma de pago ≠ ${String(expected)}` };
        break;
      case "lender":
        if (!q.lender || q.lender !== expected) return { ok: false, why: `financiera ≠ ${String(expected)}` };
        break;
      case "min_term_months":
        if (q.termMonths === null || q.termMonths < Number(expected)) return { ok: false, why: `plazo < ${String(expected)}` };
        break;
      case "max_term_months":
        if (q.termMonths === null || q.termMonths > Number(expected)) return { ok: false, why: `plazo > ${String(expected)}` };
        break;
      case "min_down_payment_pct": {
        if (q.downPayment === null || !q.vehiclePrice) return { ok: false, why: "sin enganche/precio para evaluar" };
        if (q.downPayment / q.vehiclePrice < Number(expected)) return { ok: false, why: `enganche < ${Number(expected) * 100}%` };
        break;
      }
      case "min_down_payment_amount":
        if (q.downPayment === null || q.downPayment < Number(expected)) return { ok: false, why: `enganche < ${String(expected)}` };
        break;
    }
  }
  return { ok: true, why: "condiciones cumplidas" };
}

function pickBaseOffer(offers: BonusOffer[], q: BonusQuery): { offer: BonusOffer; status: InfoStatus } | null {
  const candidates = offers
    .filter((o) => o.vehicleId === q.vehicleId && (o.versionId === null || o.versionId === q.versionId))
    .map((o) => ({ offer: o, eff: effectiveStatus(o, q.now) }))
    .filter((c) => c.eff.presentableAsCurrent && c.offer.amount !== null && c.offer.amount > 0);
  if (candidates.length === 0) return null;
  // Más específico (por versión) primero; luego el más reciente.
  candidates.sort((a, b) => {
    const spec = Number(b.offer.versionId !== null) - Number(a.offer.versionId !== null);
    if (spec !== 0) return spec;
    return (b.offer.validFrom?.getTime() ?? 0) - (a.offer.validFrom?.getTime() ?? 0);
  });
  return { offer: candidates[0]!.offer, status: candidates[0]!.eff.status };
}

export function resolveBonus(offers: BonusOffer[], rules: PromotionRuleLike[], q: BonusQuery): BonusResolution {
  const trace: string[] = [];
  const base = pickBaseOffer(offers, q);
  if (!base) {
    trace.push("No hay bono vigente para este vehículo/versión.");
    return { amount: 0, status: "unknown", offerId: null, offerTitle: null, appliedRuleIds: [], trace };
  }
  let amount = base.offer.amount!;
  trace.push(`Bono base "${base.offer.title}": ${amount} (${base.status}). El enganche no modifica el bono.`);

  const applied: string[] = [];
  const offerRules = rules
    .filter((r) => r.offerId === base.offer.id && r.ruleType === "bonus_adjustment")
    .sort((a, b) => a.priority - b.priority);

  for (const rule of offerRules) {
    const eff = effectiveStatus(rule, q.now);
    if (eff.expired) {
      trace.push(`Regla "${rule.name}" ignorada: vencida.`);
      continue;
    }
    if (eff.notYetValid) {
      trace.push(`Regla "${rule.name}" ignorada: aún no vigente.`);
      continue;
    }
    if (!isBindingRuleStatus(eff.status)) {
      trace.push(`Regla "${rule.name}" ignorada: estatus "${eff.status}" no es vinculante.`);
      continue;
    }
    const effectKeys = Object.keys(rule.effect);
    if (effectKeys.length === 0 || effectKeys.some((k) => !KNOWN_EFFECTS.has(k))) {
      trace.push(`Regla "${rule.name}" ignorada: efecto no reconocido.`);
      continue;
    }
    const match = conditionMatches(rule.condition, q);
    if (!match.ok) {
      trace.push(`Regla "${rule.name}" no aplica: ${match.why}.`);
      continue;
    }
    if (typeof rule.effect.set_bonus_amount === "number") amount = rule.effect.set_bonus_amount;
    if (typeof rule.effect.add_bonus_amount === "number") amount += rule.effect.add_bonus_amount;
    applied.push(rule.id);
    trace.push(`Regla explícita "${rule.name}" aplicada → bono ${amount}.`);
  }

  return {
    amount,
    status: base.status,
    offerId: base.offer.id,
    offerTitle: base.offer.title,
    appliedRuleIds: applied,
    trace,
  };
}
