/**
 * Cotizaciones como memoria comercial validada: se recuperan solo escenarios exactos.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/server/db/schema";
import { DAY_MS } from "@/server/lib/clock";
import { attachValidatedQuote, listCustomerQuotes, lookupScenario, NO_VALIDATED_SCENARIO, registerValidatedScenario } from "@/server/services/quotes";
import { makeApp, newProspect, type TestApp } from "./helpers";

describe("memoria de corridas validadas", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("una corrida exacta validada se recupera", async () => {
    const r = await lookupScenario(app, { model: "City", version: "Sport", downPayment: 80_000, termMonths: 48 });
    expect(r.validated?.monthlyPayment).toBe(5_890);
    expect(r.message).toBeNull();
  });

  it("un escenario distinto NO reutiliza ni ajusta la corrida", async () => {
    const r = await lookupScenario(app, { model: "City", version: "Sport", downPayment: 120_000, termMonths: 48 });
    expect(r.validated).toBeNull();
    expect(r.message).toBe(NO_VALIDATED_SCENARIO);
    // Lo que sí existe es una ESTIMACIÓN, etiquetada como tal y con el mismo bono.
    expect(r.estimate?.calculationType).toBe("estimate");
    expect(r.estimate?.monthlyPayment).not.toBe(5_890);
    expect(r.estimate?.bonus).toBe(40_000);
    const otherTerm = await lookupScenario(app, { model: "City", version: "Sport", downPayment: 80_000, termMonths: 36 });
    expect(otherTerm.validated).toBeNull();
  });

  it("cambiar el enganche no cambia el bono salvo regla explícita", async () => {
    const bonuses = await Promise.all([80_000, 100_000, 150_000, 200_000].map((dp) => lookupScenario(app, { model: "City", version: "Sport", downPayment: dp, termMonths: 48 })));
    expect(new Set(bonuses.map((b) => b.validated?.bonus ?? b.estimate?.bonus))).toEqual(new Set([40_000]));
  });

  it("Mario registra su propia corrida (City Touring-like) y se recuerda solo para ese escenario", async () => {
    await registerValidatedScenario(app, { model: "HR-V", version: "Touring", vehiclePrice: 520_000, bonus: 0, downPayment: 100_000, termMonths: 48, monthlyPayment: 11_111, validTo: new Date(app.clock.now().getTime() + 10 * DAY_MS), sourceName: "Corrida de Mario (prueba)" });
    expect((await lookupScenario(app, { model: "HR-V", version: "Touring", downPayment: 100_000, termMonths: 48 })).validated?.monthlyPayment).toBe(11_111);
    expect((await lookupScenario(app, { model: "HR-V", version: "Touring", downPayment: 120_000, termMonths: 48 })).validated).toBeNull();
  });

  it("una corrida vencida no se presenta como vigente", async () => {
    await registerValidatedScenario(app, { model: "City", version: "Uniq", vehiclePrice: 290_000, bonus: 40_000, downPayment: 60_000, termMonths: 36, monthlyPayment: 7_777, validTo: new Date(app.clock.now().getTime() - DAY_MS), sourceName: "Corrida vieja (prueba)" });
    const r = await lookupScenario(app, { model: "City", version: "Uniq", downPayment: 60_000, termMonths: 36 });
    expect(r.validated).toBeNull();
    expect(r.message).toMatch(/venció/);
  });

  it("una cotización guardada vencida se lista como histórica y no se convierte en venta", async () => {
    const p = await newProspect(app, "Cotizaciones");
    const [tpl] = await app.db.select().from(s.quoteTemplates).where(eq(s.quoteTemplates.downPayment, 80_000));
    const q = await attachValidatedQuote(app, p.customer.id, tpl!.id);
    app.testClock.advance(30 * DAY_MS); // la corrida DEMO vence a +20 días
    const quotes = await listCustomerQuotes(app, p.customer.id);
    expect(quotes.find((x) => x.id === q.id)!.effectiveLabel).toMatch(/Histórica/);
    expect(quotes.find((x) => x.id === q.id)!.saleId).toBeNull();
    const sales = await app.db.select().from(s.saleRecords).where(eq(s.saleRecords.customerId, p.customer.id));
    expect(sales).toHaveLength(0);
    app.testClock.advance(-30 * DAY_MS);
  });
});
