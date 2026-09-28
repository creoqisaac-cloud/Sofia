/**
 * Cotizador V2: exactitud reproducible, cero invento, vigencia, bono, enganche, plazo y calibración.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calibrateProgram, computeQuoteV2, MISSING_EXACT, type FinanceProgramSpec, type QuoteV2Input } from "@/domain/quote-v2";
import * as s from "@/server/db/schema";
import { calibrateFinanceProgram, runQuote, saveQuoteRun } from "@/server/services/quote-v2";
import { makeApp, newProspect, type TestApp } from "./helpers";

const NOW = new Date("2026-09-27T16:00:00Z");
const src = (amount: number, extra: Partial<QuoteV2Input["price"] & object> = {}) => ({ amount, sourceLabel: "Fuente de prueba", status: "confirmed" as const, validFrom: null, validTo: null, isDemo: false, ...extra });
const PROGRAM: FinanceProgramSpec = {
  id: "p1",
  lender: "Financiera Prueba",
  name: "Plan Prueba",
  sourceLabel: "Fuente de prueba",
  isDemo: false,
  calibrationStatus: "validated",
  validFrom: null,
  validTo: null,
  bonusApplication: "price_reduction",
  ivaOnInterest: true,
  ivaRate: 0.16,
  openingCommissionRate: 0.02,
  openingCommissionFinanced: false,
  openingCommissionIva: true,
  insuranceMode: "cash",
  minDownPaymentRate: 0.1,
  terms: [
    { termMonths: 36, annualRate: 0.12 },
    { termMonths: 48, annualRate: 0.13 },
    { termMonths: 60, annualRate: null },
  ],
};
const base = (over: Partial<QuoteV2Input> = {}): QuoteV2Input => ({ modelLabel: "Modelo Prueba", downPayment: 100_000, termMonths: 48, price: src(400_000), bonus: src(20_000), program: PROGRAM, insurance: src(20_000), extras: [], now: NOW, ...over });
const comp = (r: ReturnType<typeof computeQuoteV2>, k: string) => r.components.find((c) => c.key === k)!;

describe("motor V2 (dominio)", () => {
  it("cotización reproducible: mismas entradas → mismos componentes, con fuente en cada cifra", () => {
    const a = computeQuoteV2(base());
    const b = computeQuoteV2(base());
    expect(a).toEqual(b);
    expect(a.exactness).toBe("exact");
    // (400,000 − 20,000 − 100,000) = 280,000 financiados; comisión 2% + IVA de contado
    expect(comp(a, "amount_financed").amount).toBe(280_000);
    expect(comp(a, "opening_commission").amount).toBe(6_496);
    expect(comp(a, "initial_payment").amount).toBe(100_000 + 6_496 + 20_000);
    for (const c of a.components.filter((x) => x.amount !== null)) expect(c.source, c.key).toBeTruthy();
    const r = (0.13 / 12) * 1.16;
    const expected = Math.round(((280_000 * r) / (1 - Math.pow(1 + r, -48))) * 100) / 100;
    expect(a.monthlyPayment).toBe(expected);
  });

  it("cero invento: si falta un parámetro, NO hay mensualidad y se dice exactamente qué falta", () => {
    const r = computeQuoteV2(base({ program: { ...PROGRAM, ivaOnInterest: null, insuranceMode: null } }));
    expect(r.exactness).toBe("incomplete");
    expect(r.monthlyPayment).toBeNull();
    expect(r.headline).toBe(MISSING_EXACT);
    expect(r.missing).toEqual(expect.arrayContaining(["No sé si la mensualidad lleva IVA sobre intereses.", "No sé si el seguro va de contado, financiado o fuera de la corrida."]));
    expect(comp(r, "monthly_payment").amount).toBeNull();
    const noProgram = computeQuoteV2(base({ program: null }));
    expect(noProgram.missing[0]).toMatch(/programa de financiamiento/);
    const noInsurance = computeQuoteV2(base({ insurance: null }));
    expect(noInsurance.missing.join(" ")).toMatch(/monto del seguro/);
  });

  it("plazo: tasa no respaldada o plazo inexistente → incompleto", () => {
    expect(computeQuoteV2(base({ termMonths: 60 })).missing).toContain("No tengo la tasa vigente para 60 meses.");
    expect(computeQuoteV2(base({ termMonths: 72 })).missing.join(" ")).toMatch(/no tiene plazo de 72 meses/);
  });

  it("vigencia: precio o programa vencidos no producen corrida", () => {
    const expiredPrice = computeQuoteV2(base({ price: src(400_000, { validTo: new Date("2026-01-01") }) }));
    expect(expiredPrice.exactness).toBe("incomplete");
    expect(expiredPrice.missing.join(" ")).toMatch(/no está vigente/);
    const expiredProgram = computeQuoteV2(base({ program: { ...PROGRAM, validTo: new Date("2026-01-01") } }));
    expect(expiredProgram.missing.join(" ")).toMatch(/vencido/);
  });

  it("bono: debe estar confirmado y vigente; nunca depende del enganche", () => {
    const rumor = computeQuoteV2(base({ bonus: src(20_000, { status: "estimate" }) }));
    expect(rumor.missing).toContain("El bono no está confirmado y vigente.");
    const low = computeQuoteV2(base({ downPayment: 80_000 }));
    const high = computeQuoteV2(base({ downPayment: 200_000 }));
    expect(comp(low, "bonus").amount).toBe(comp(high, "bonus").amount);
    const unknownApplication = computeQuoteV2(base({ program: { ...PROGRAM, bonusApplication: null } }));
    expect(unknownApplication.missing.join(" ")).toMatch(/cómo entra el bono/);
  });

  it("enganche: más enganche → menos financiado y menor mensualidad; bajo el mínimo → incompleto", () => {
    const a = computeQuoteV2(base({ downPayment: 100_000 }));
    const b = computeQuoteV2(base({ downPayment: 150_000 }));
    expect(comp(b, "amount_financed").amount!).toBeLessThan(comp(a, "amount_financed").amount!);
    expect(b.monthlyPayment!).toBeLessThan(a.monthlyPayment!);
    expect(computeQuoteV2(base({ downPayment: 10_000 })).missing.join(" ")).toMatch(/menor al mínimo/);
  });

  it("un programa sin validar da cálculo 'sin validar', nunca 'exacto'", () => {
    const r = computeQuoteV2(base({ program: { ...PROGRAM, calibrationStatus: "unverified" } }));
    expect(r.exactness).toBe("unvalidated");
    expect(r.headline).not.toMatch(/exacta/i);
  });

  it("calibración: compara componente por componente y NO ajusta; sin corridas → sin verificar", () => {
    const truth = computeQuoteV2(base());
    const ex = { id: "e1", label: "Corrida real", downPayment: 100_000, termMonths: 48, vehiclePrice: 400_000, bonus: 20_000, insurance: 20_000, expected: { monthly_payment: truth.monthlyPayment!, opening_commission: 6_496, amount_financed: 280_000 } };
    expect(calibrateProgram(PROGRAM, [ex], NOW).status).toBe("validated");
    // Si el programa dice "sin IVA sobre intereses", la corrida real NO cuadra y se reporta la diferencia.
    const wrong = calibrateProgram({ ...PROGRAM, ivaOnInterest: false }, [ex], NOW);
    expect(wrong.status).toBe("calibrating");
    const diff = wrong.cases[0]!.diffs.find((d) => d.key === "monthly_payment")!;
    expect(diff.diff).not.toBe(0);
    expect(calibrateProgram(PROGRAM, [], NOW).status).toBe("unverified");
    expect(calibrateProgram({ ...PROGRAM, validTo: new Date("2026-01-01") }, [ex], NOW).status).toBe("expired");
  });
});

describe("cotizador V2 (servicio, datos DEMO)", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("HR-V Touring 150k/48: programa DEMO validado → corrida exacta (DEMO) y queda registrada", async () => {
    const q = await runQuote(app, { model: "HR-V", version: "Touring", downPayment: 150_000, termMonths: 48 });
    expect(q.result.exactness).toBe("exact");
    expect(q.result.isDemo).toBe(true);
    expect(q.result.monthlyPayment).toBeGreaterThan(0);
    const [run] = await app.db.select().from(s.quoteRuns).where(eq(s.quoteRuns.id, q.runId));
    expect(run!.exactness).toBe("exact");
    // La corrida DEMO de referencia se reproduce sin diferencias
    const [ex] = await app.db.select().from(s.validatedQuoteExamples).where(eq(s.validatedQuoteExamples.label, "HR-V Touring · 150,000 · 48 m (DEMO)"));
    expect(q.result.monthlyPayment).toBe(ex!.expected.monthly_payment);
  });

  it("CR-V: programa incompleto → no inventa; Civic: precio vencido → no inventa; versión inexistente → error honesto", async () => {
    const crv = await runQuote(app, { model: "CR-V", version: "Turbo Plus", downPayment: 200_000, termMonths: 36 });
    expect(crv.result.exactness).toBe("incomplete");
    expect(crv.result.monthlyPayment).toBeNull();
    const civic = await runQuote(app, { model: "Civic", version: "Sport", downPayment: 150_000, termMonths: 60 });
    expect(civic.result.missing.join(" ")).toMatch(/no está vigente/);
    await expect(runQuote(app, { model: "City", version: "Touring", downPayment: 100_000, termMonths: 48 })).rejects.toThrow(/No tengo la versión Touring/);
  });

  it("el enganche no cambia el bono vigente (CR-V con regla explícita)", async () => {
    const a = await runQuote(app, { model: "CR-V", version: "Turbo Plus", downPayment: 150_000, termMonths: 36 });
    const b = await runQuote(app, { model: "CR-V", version: "Turbo Plus", downPayment: 400_000, termMonths: 36 });
    const bonus = (q: typeof a) => q.result.components.find((c) => c.key === "bonus")!.amount;
    expect(bonus(a)).toBe(bonus(b));
  });

  it("guardar/asignar: una corrida exacta queda en las cotizaciones del cliente; una incompleta no se guarda", async () => {
    const p = await newProspect(app, "Cliente Cotización V2");
    const q = await runQuote(app, { model: "City", version: "Sport", downPayment: 80_000, termMonths: 48 });
    const { quoteId } = await saveQuoteRun(app, q.runId, p.customer.id);
    const [quote] = await app.db.select().from(s.quotes).where(eq(s.quotes.id, quoteId!));
    expect(quote!.calculationType).toBe("validated_template");
    expect(quote!.quoteRunId).toBe(q.runId);
    const bad = await runQuote(app, { model: "CR-V", version: "Turbo Plus", downPayment: 200_000, termMonths: 36 });
    await expect(saveQuoteRun(app, bad.runId, p.customer.id)).rejects.toThrow(/incompleta/);
  });

  it("recalibrar el programa DEMO no cambia nada por sí solo (sin ajustes manuales)", async () => {
    const [plan] = await app.db.select().from(s.financePrograms).where(eq(s.financePrograms.name, "Plan tradicional DEMO"));
    const report = await calibrateFinanceProgram(app, plan!.id);
    expect(report.status).toBe("validated");
    const [crv] = await app.db.select().from(s.financePrograms).where(eq(s.financePrograms.name, "Plan CR-V DEMO (incompleto)"));
    expect((await calibrateFinanceProgram(app, crv!.id)).status).toBe("calibrating");
  });
});
