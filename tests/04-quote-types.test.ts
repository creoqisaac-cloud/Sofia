/**
 * 4. Una cotización estimada nunca se presenta como oficial.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardReply, type GuardContext } from "@/domain/guards";
import { loadCatalog } from "@/server/commercial/catalog";
import { computeQuote } from "@/server/commercial/quoting";
import * as s from "@/server/db/schema";
import { registerOfficialQuote } from "@/server/services/commercial";
import { makeApp, newProspect, scripted, type TestApp } from "./helpers";

const CTX: GuardContext = {
  allowedAmounts: [5_890, 3_546],
  historicalAmounts: [],
  allowedPercents: [],
  historicalPercents: [],
  customerAmounts: [],
  estimateAmounts: [3_546],
  officialQuoteAvailable: false,
  marioEvidence: false,
  knownFactKeys: [],
  confirmedAvailability: false,
  confirmedWarranty: false,
};

describe("tipos de cotización", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("el motor solo produce 'validated_template' (coincidencia exacta) o 'estimate'", async () => {
    const cat = await loadCatalog(app.db, app.workspaceId);
    const exact = computeQuote(cat, { model: "City", version: "Sport", downPayment: 80_000, termMonths: 48, paymentMethod: "financing" }, app.clock.now());
    const other = computeQuote(cat, { model: "City", version: "Sport", downPayment: 100_000, termMonths: 48, paymentMethod: "financing" }, app.clock.now());
    expect(exact.ok && exact.quote.calculationType).toBe("validated_template");
    expect(other.ok && other.quote.calculationType).toBe("estimate");
  });

  it("la base de datos impide que Sofía registre una cotización oficial", async () => {
    const p = await newProspect(app);
    await expect(
      app.db.insert(s.quotes).values({
        workspaceId: app.workspaceId,
        customerId: p.customer.id,
        calculationType: "official",
        vehiclePrice: 320_000,
        downPayment: 80_000,
        createdBy: "sofia",
      }),
    ).rejects.toThrow();
  });

  it("Mario sí puede registrar una oficial (con fuente)", async () => {
    const p = await newProspect(app);
    const q = await registerOfficialQuote(app, {
      customerId: p.customer.id,
      model: "City",
      version: "Sport",
      vehiclePrice: 320_000,
      downPayment: 80_000,
      termMonths: 48,
      monthlyPayment: 5_890,
      annualRate: 0.139,
      bonus: 40_000,
      validUntil: new Date("2026-10-15"),
      sourceName: "PDF cotización financiera (prueba)",
      sourceReference: null,
    });
    expect(q.calculationType).toBe("official");
    expect(q.createdBy).toBe("mario");
  });

  it("guardrail: 'cotización oficial' sin cotización oficial registrada se bloquea", () => {
    const bad = guardReply("Te comparto tu cotización oficial: $5,890 al mes.", CTX);
    expect(bad.blocked).toBe(true);
    expect(bad.violations.map((v) => v.code)).toContain("false_official_claim");
    const ok = guardReply("Es una corrida validada; la cotización oficial te la confirma Mario.", CTX);
    expect(ok.blocked).toBe(false);
  });

  it("guardrail: una estimación sin etiqueta recibe la aclaración automáticamente", () => {
    const r = guardReply("Te quedaría en $3,546 al mes.", CTX);
    expect(r.blocked).toBe(false);
    expect(r.finalReply).toMatch(/estimación/);
    expect(r.violations[0]!.code).toBe("estimate_unlabeled");
  });

  it("en conversación, la estimación se etiqueta y se guarda como 'estimate'", async () => {
    const p = await newProspect(app, "Luis");
    const turn = await p.say("Me interesa el City Sport, tengo 100 mil de enganche, ¿cuánto pagaría al mes a 48 meses?");
    expect(turn.reply).toMatch(/aprox|estimación/);
    expect(turn.reply).not.toMatch(/oficial/i);
    const state = await p.state();
    expect(state.quotes[0]!.calculationType).toBe("estimate");
    expect(state.quotes[0]!.status).toBe("presented");
  });

  it("si el modelo dice 'oficial', se bloquea y la cotización queda como borrador", async () => {
    const app2 = await makeApp(scripted(() => ({ customer_reply: "Esta es tu cotización oficial: quedaría en $3,546 al mes." })));
    const p = await newProspect(app2);
    const turn = await p.say("Me interesa el City Sport, tengo 150 mil de enganche, ¿cuánto al mes a 48 meses?");
    expect(turn.status).toBe("fallback");
    expect(turn.reply).not.toMatch(/oficial/i);
    const state = await p.state();
    expect(state.quotes.every((q) => q.calculationType !== "official")).toBe(true);
    expect(state.quotes[0]!.status).toBe("draft");
    await app2.close();
  });
});
