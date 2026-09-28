/**
 * Motor de cotización V2 (determinista, puro).
 *
 * Una corrida se arma por COMPONENTES; cada cifra lleva su fuente. El motor nunca
 * inventa: si un parámetro del programa de financiamiento no está respaldado por una
 * fuente (tasa, IVA sobre intereses, % de apertura, manejo del seguro, aplicación del
 * bono…), el resultado es "incompleto", NO se muestra mensualidad y se lista qué falta.
 *
 * Exactitud: solo es "exacta" si el programa está VALIDATED, es decir, reprodujo sin
 * diferencias corridas reales de Mario (ver `calibrateProgram`). Un cálculo completo con
 * un programa sin calibrar es "sin validar", nunca "exacto".
 */
import { effectiveStatus, isBindingRuleStatus } from "./knowledge";
import type { InfoStatus } from "./enums";
import { roundMoney } from "./money";

export const PROGRAM_CALIBRATION_STATUSES = ["unverified", "calibrating", "validated", "expired"] as const;
export type ProgramCalibrationStatus = (typeof PROGRAM_CALIBRATION_STATUSES)[number];

export const PROGRAM_CALIBRATION_LABELS: Record<ProgramCalibrationStatus, string> = {
  unverified: "Sin verificar",
  calibrating: "En calibración",
  validated: "Validado contra corridas reales",
  expired: "Vencido",
};

/** Diferencia máxima aceptada por componente: 1 centavo (los montos se redondean a centavos). */
export const CALIBRATION_TOLERANCE = 0.01;

export interface SourcedAmount {
  amount: number;
  sourceLabel: string;
  status: InfoStatus;
  validFrom: Date | null;
  validTo: Date | null;
  isDemo: boolean;
}

export interface FinanceTermSpec {
  termMonths: number;
  /** Tasa anual nominal (fracción, p. ej. 0.1299). null = no respaldada. */
  annualRate: number | null;
}

export interface FinanceProgramSpec {
  id: string;
  lender: string;
  name: string;
  sourceLabel: string;
  isDemo: boolean;
  calibrationStatus: ProgramCalibrationStatus;
  validFrom: Date | null;
  validTo: Date | null;
  // Parámetros: null = la fuente no lo define (el motor NO lo supone).
  bonusApplication: "price_reduction" | "down_payment" | null;
  ivaOnInterest: boolean | null;
  ivaRate: number | null;
  openingCommissionRate: number | null;
  openingCommissionFinanced: boolean | null;
  openingCommissionIva: boolean | null;
  insuranceMode: "cash" | "financed" | "not_included" | null;
  minDownPaymentRate: number | null;
  terms: FinanceTermSpec[];
}

export const COMPONENT_KEYS = [
  "vehicle_price",
  "bonus",
  "price_after_bonus",
  "down_payment",
  "opening_commission",
  "insurance",
  "extras",
  "amount_financed",
  "annual_rate",
  "monthly_payment",
  "initial_payment",
  "total_paid",
] as const;
export type ComponentKey = (typeof COMPONENT_KEYS)[number];

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  vehicle_price: "Precio",
  bonus: "Bono",
  price_after_bonus: "Precio con bono",
  down_payment: "Enganche",
  opening_commission: "Comisión por apertura",
  insurance: "Seguro",
  extras: "Accesorios / garantía / otros",
  amount_financed: "Monto financiado",
  annual_rate: "Tasa anual",
  monthly_payment: "Mensualidad",
  initial_payment: "Pago inicial",
  total_paid: "Total a pagar",
};

export interface QuoteComponent {
  key: ComponentKey;
  label: string;
  amount: number | null;
  /** Fuente de la cifra; para cifras calculadas, la fórmula y sus insumos. */
  source: string | null;
  kind: "sourced" | "computed" | "input" | "missing" | "not_applicable";
  note?: string;
}

export interface QuoteV2Input {
  modelLabel: string;
  downPayment: number;
  termMonths: number;
  price: SourcedAmount | null;
  /** Bono ya resuelto por la regla del bono (el enganche nunca lo aumenta). null = sin bono vigente. */
  bonus: SourcedAmount | null;
  program: FinanceProgramSpec | null;
  insurance: SourcedAmount | null;
  extras: Array<{ label: string; amount: number; sourceLabel: string; financed: boolean | null }>;
  now: Date;
}

export type QuoteExactness = "exact" | "unvalidated" | "incomplete";

export interface QuoteV2Result {
  exactness: QuoteExactness;
  components: QuoteComponent[];
  monthlyPayment: number | null;
  missing: string[];
  isDemo: boolean;
  programId: string | null;
  headline: string;
}

export const MISSING_EXACT = "Falta información para reproducir esta cotización exactamente.";

function pmt(principal: number, monthlyRate: number, n: number): number {
  if (principal <= 0) return 0;
  if (monthlyRate === 0) return roundMoney(principal / n);
  return roundMoney((principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n)));
}

const current = (a: SourcedAmount | null, now: Date) => (a ? effectiveStatus(a, now).presentableAsCurrent : false);

export function computeQuoteV2(input: QuoteV2Input): QuoteV2Result {
  const { now, program: p } = input;
  const missing: string[] = [];
  const comps: Partial<Record<ComponentKey, QuoteComponent>> = {};
  const put = (key: ComponentKey, amount: number | null, kind: QuoteComponent["kind"], source: string | null, note?: string) => {
    comps[key] = { key, label: COMPONENT_LABELS[key], amount: amount === null ? null : key === "annual_rate" ? amount : roundMoney(amount), source, kind, note };
  };

  // Precio
  if (!input.price) missing.push(`No tengo el precio de ${input.modelLabel}.`);
  else if (!current(input.price, now)) missing.push(`El precio registrado de ${input.modelLabel} no está vigente.`);
  if (input.price) put("vehicle_price", input.price.amount, "sourced", input.price.sourceLabel);
  else put("vehicle_price", null, "missing", null);

  // Bono (resuelto por la regla del bono; aquí solo se verifica su respaldo)
  const bonus = input.bonus?.amount ?? 0;
  if (input.bonus && bonus > 0) {
    if (!current(input.bonus, now) || !isBindingRuleStatus(input.bonus.status)) missing.push("El bono no está confirmado y vigente.");
    put("bonus", bonus, "sourced", input.bonus.sourceLabel);
  } else put("bonus", 0, "sourced", input.bonus?.sourceLabel ?? "Sin bono vigente registrado");

  put("down_payment", input.downPayment, "input", "Capturado por Mario");

  // Programa
  let rate: number | null = null;
  if (!p) missing.push(`No tengo un programa de financiamiento vigente para ${input.modelLabel}.`);
  else {
    const eff = effectiveStatus({ status: "confirmed", validFrom: p.validFrom, validTo: p.validTo }, now);
    if (eff.expired || p.calibrationStatus === "expired") missing.push(`El programa ${p.name} está vencido.`);
    const term = p.terms.find((t) => t.termMonths === input.termMonths);
    if (!term) missing.push(`El programa ${p.name} no tiene plazo de ${input.termMonths} meses.`);
    else if (term.annualRate === null) missing.push(`No tengo la tasa vigente para ${input.termMonths} meses.`);
    else rate = term.annualRate;
    if (bonus > 0 && p.bonusApplication === null) missing.push("No sé cómo entra el bono en la corrida (reduce el precio o se suma al enganche).");
    if (p.ivaOnInterest === null) missing.push("No sé si la mensualidad lleva IVA sobre intereses.");
    if ((p.ivaOnInterest || p.openingCommissionIva) && p.ivaRate === null) missing.push("Falta la tasa de IVA aplicable.");
    if (p.openingCommissionRate === null) missing.push("No tengo el % de comisión por apertura.");
    if (p.openingCommissionFinanced === null) missing.push("No sé si la comisión por apertura se paga de contado o se financia.");
    if (p.openingCommissionIva === null) missing.push("No sé si la comisión por apertura lleva IVA.");
    if (p.insuranceMode === null) missing.push("No sé si el seguro va de contado, financiado o fuera de la corrida.");
    else if (p.insuranceMode !== "not_included") {
      if (!input.insurance) missing.push(`No tengo el monto del seguro para ${input.modelLabel} a ${input.termMonths} meses.`);
      else if (!current(input.insurance, now)) missing.push("El monto del seguro registrado no está vigente.");
    }
  }
  for (const e of input.extras) if (e.financed === null) missing.push(`No sé si "${e.label}" se paga de contado o se financia.`);

  const price = input.price?.amount ?? null;
  const reducesPrice = p?.bonusApplication === "price_reduction";
  const toDown = p?.bonusApplication === "down_payment";
  const afterBonus = price === null ? null : price - (reducesPrice ? bonus : 0);
  put("price_after_bonus", afterBonus, reducesPrice ? "computed" : "not_applicable", reducesPrice ? "Precio − bono" : "El bono no reduce el precio en este programa");
  if (p?.minDownPaymentRate != null && price !== null && input.downPayment + (toDown ? bonus : 0) < price * p.minDownPaymentRate) {
    missing.push(`El enganche es menor al mínimo del programa (${Math.round(p.minDownPaymentRate * 100)}%).`);
  }
  if (price !== null && input.downPayment >= (afterBonus ?? price)) missing.push("El enganche cubre el precio: no hay monto a financiar.");

  const complete = missing.length === 0 && p !== null && rate !== null && afterBonus !== null;
  let monthly: number | null = null;
  if (complete) {
    const iva = p.ivaRate ?? 0;
    const effectiveDown = input.downPayment + (toDown ? bonus : 0);
    const base = afterBonus - effectiveDown;
    const commission = roundMoney(base * p.openingCommissionRate! * (p.openingCommissionIva ? 1 + iva : 1));
    const insurance = p.insuranceMode === "not_included" ? 0 : input.insurance!.amount;
    const extrasFinanced = input.extras.filter((e) => e.financed).reduce((s, e) => s + e.amount, 0);
    const extrasCash = input.extras.filter((e) => !e.financed).reduce((s, e) => s + e.amount, 0);
    const financed = roundMoney(base + (p.openingCommissionFinanced ? commission : 0) + (p.insuranceMode === "financed" ? insurance : 0) + extrasFinanced);
    const monthlyRate = (rate! / 12) * (p.ivaOnInterest ? 1 + iva : 1);
    monthly = pmt(financed, monthlyRate, input.termMonths);
    const initial = roundMoney(input.downPayment + (p.openingCommissionFinanced ? 0 : commission) + (p.insuranceMode === "cash" ? insurance : 0) + extrasCash);
    put("opening_commission", commission, "computed", `${(p.openingCommissionRate! * 100).toFixed(2)}% sobre monto a financiar${p.openingCommissionIva ? " + IVA" : ""} · ${p.openingCommissionFinanced ? "financiada" : "de contado"} · ${p.sourceLabel}`);
    if (p.insuranceMode === "not_included") put("insurance", null, "not_applicable", "Fuera de la corrida según el programa");
    else put("insurance", insurance, "sourced", `${input.insurance!.sourceLabel} · ${p.insuranceMode === "cash" ? "de contado" : "financiado"}`);
    put("extras", input.extras.length ? extrasFinanced + extrasCash : null, input.extras.length ? "sourced" : "not_applicable", input.extras.map((e) => `${e.label} (${e.sourceLabel})`).join(", ") || "Sin accesorios");
    put("amount_financed", financed, "computed", "Precio con bono − enganche + conceptos financiados");
    put("annual_rate", rate, "sourced", `${p.sourceLabel}${p.ivaOnInterest ? " · mensualidad con IVA sobre intereses" : ""}`);
    put("monthly_payment", monthly, "computed", `Pago fijo a ${input.termMonths} meses`);
    put("initial_payment", initial, "computed", "Enganche + conceptos de contado");
    put("total_paid", roundMoney(initial + monthly * input.termMonths), "computed", "Pago inicial + mensualidades");
  } else {
    for (const k of ["opening_commission", "insurance", "amount_financed", "annual_rate", "monthly_payment", "initial_payment", "total_paid"] as ComponentKey[]) {
      put(k, k === "annual_rate" ? rate : null, k === "annual_rate" && rate !== null ? "sourced" : "missing", k === "annual_rate" && rate !== null ? p?.sourceLabel ?? null : null);
    }
  }

  const exactness: QuoteExactness = !complete ? "incomplete" : p.calibrationStatus === "validated" ? "exact" : "unvalidated";
  const isDemo = Boolean(input.price?.isDemo || input.bonus?.isDemo || p?.isDemo || input.insurance?.isDemo);
  const headline =
    exactness === "exact"
      ? `Corrida exacta · programa validado${isDemo ? " (DEMO)" : ""}`
      : exactness === "unvalidated"
        ? "Cálculo sin validar: el programa aún no reproduce corridas reales de Mario"
        : MISSING_EXACT;
  return {
    exactness,
    components: COMPONENT_KEYS.map((k) => comps[k]!).filter(Boolean),
    monthlyPayment: exactness === "incomplete" ? null : monthly,
    missing,
    isDemo,
    programId: p?.id ?? null,
    headline,
  };
}

// ───────────────────────────── calibración ─────────────────────────────

export interface ValidatedExampleSpec {
  id: string;
  label: string;
  downPayment: number;
  termMonths: number;
  vehiclePrice: number;
  bonus: number;
  insurance: number | null;
  /** Componentes que la corrida real de Mario muestra. Solo se comparan los presentes. */
  expected: Partial<Record<ComponentKey, number>>;
}

export interface CalibrationCase {
  exampleId: string;
  label: string;
  passed: boolean;
  diffs: Array<{ key: ComponentKey; expected: number; actual: number | null; diff: number | null }>;
  missing: string[];
}

export interface CalibrationReport {
  status: ProgramCalibrationStatus;
  cases: CalibrationCase[];
  summary: string;
}

/**
 * Ejecuta el programa contra corridas conocidas. No ajusta nada: si algo no cuadra,
 * reporta la diferencia por componente para encontrar la regla que falta.
 */
export function calibrateProgram(program: FinanceProgramSpec, examples: ValidatedExampleSpec[], now: Date): CalibrationReport {
  if (program.validTo && program.validTo.getTime() < now.getTime()) return { status: "expired", cases: [], summary: "Programa vencido." };
  if (examples.length === 0) return { status: "unverified", cases: [], summary: "Sin corridas reales para comparar." };
  const src = (amount: number, label: string): SourcedAmount => ({ amount, sourceLabel: label, status: "confirmed", validFrom: null, validTo: null, isDemo: program.isDemo });
  const cases = examples.map((ex): CalibrationCase => {
    const res = computeQuoteV2({
      modelLabel: ex.label,
      downPayment: ex.downPayment,
      termMonths: ex.termMonths,
      price: src(ex.vehiclePrice, "corrida"),
      bonus: ex.bonus > 0 ? src(ex.bonus, "corrida") : null,
      program: { ...program, calibrationStatus: "calibrating" },
      insurance: ex.insurance === null ? null : src(ex.insurance, "corrida"),
      extras: [],
      now,
    });
    const diffs = (Object.entries(ex.expected) as Array<[ComponentKey, number]>).map(([key, expected]) => {
      const actual = res.components.find((c) => c.key === key)?.amount ?? null;
      return { key, expected, actual, diff: actual === null ? null : roundMoney(actual - expected) };
    });
    const passed = res.exactness !== "incomplete" && diffs.every((d) => d.diff !== null && Math.abs(d.diff) < CALIBRATION_TOLERANCE);
    return { exampleId: ex.id, label: ex.label, passed, diffs, missing: res.missing };
  });
  const ok = cases.every((c) => c.passed);
  return {
    status: ok ? "validated" : "calibrating",
    cases,
    summary: ok ? `Reproduce ${cases.length} corrida(s) sin diferencias.` : `${cases.filter((c) => !c.passed).length} de ${cases.length} corrida(s) no cuadran.`,
  };
}
