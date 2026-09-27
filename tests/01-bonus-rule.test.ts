/**
 * 1. Aumentar el enganche NO aumenta el bono.
 * El bono pertenece a la promoción/vehículo; solo una regla explícita y vigente lo cambia.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveBonus, type BonusOffer, type PromotionRuleLike } from "@/domain/bonus";
import { loadCatalog } from "@/server/commercial/catalog";
import { computeQuote } from "@/server/commercial/quoting";
import { makeApp, newProspect, scripted, type TestApp } from "./helpers";

const NOW = new Date("2026-09-27T16:00:00Z");
const day = 24 * 3600 * 1000;
const cityBonus: BonusOffer = {
  id: "offer-city",
  title: "Bono City",
  vehicleId: "city",
  versionId: null,
  amount: 40_000,
  status: "confirmed",
  validFrom: new Date(NOW.getTime() - 10 * day),
  validTo: new Date(NOW.getTime() + 30 * day),
};
const query = (downPayment: number) => ({
  vehicleId: "city",
  versionId: "sport",
  paymentMethod: "financing" as const,
  lender: "Financiera DEMO",
  termMonths: 48,
  downPayment,
  vehiclePrice: 320_000,
  now: NOW,
});

describe("regla del bono (dominio)", () => {
  it("City: el bono se mantiene en 40,000 con enganche de 80k, 100k, 150k y 200k", () => {
    for (const dp of [80_000, 100_000, 150_000, 200_000]) {
      expect(resolveBonus([cityBonus], [], query(dp)).amount).toBe(40_000);
    }
  });

  it("es constante para cualquier enganche si no hay reglas explícitas", () => {
    const amounts = new Set<number>();
    for (let dp = 0; dp <= 320_000; dp += 5_000) amounts.add(resolveBonus([cityBonus], [], query(dp)).amount);
    expect([...amounts]).toEqual([40_000]);
  });

  it("solo una regla explícita, vigente y confirmada puede cambiarlo", () => {
    const rule: PromotionRuleLike = {
      id: "r1",
      offerId: "offer-city",
      ruleType: "bonus_adjustment",
      name: "Bono especial con enganche ≥ 50%",
      condition: { min_down_payment_pct: 0.5 },
      effect: { set_bonus_amount: 55_000 },
      priority: 1,
      status: "confirmed",
      validFrom: new Date(NOW.getTime() - day),
      validTo: new Date(NOW.getTime() + day),
    };
    expect(resolveBonus([cityBonus], [rule], query(150_000)).amount).toBe(40_000); // 47% → no aplica
    expect(resolveBonus([cityBonus], [rule], query(160_000)).amount).toBe(55_000); // 50% → regla explícita

    const expired = { ...rule, validTo: new Date(NOW.getTime() - day) };
    expect(resolveBonus([cityBonus], [expired], query(200_000)).amount).toBe(40_000);

    const onlyEstimate = { ...rule, status: "estimate" as const };
    expect(resolveBonus([cityBonus], [onlyEstimate], query(200_000)).amount).toBe(40_000);

    const unknownCondition = { ...rule, condition: { min_down_payment_pct: 0.5, cliente_vip: true } };
    expect(resolveBonus([cityBonus], [unknownCondition], query(200_000)).amount).toBe(40_000);
  });
});

describe("regla del bono (integración con datos DEMO)", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("el motor de cotización conserva el bono de City aunque existan reglas vencidas o no confirmadas", async () => {
    const cat = await loadCatalog(app.db, app.workspaceId);
    for (const dp of [80_000, 100_000, 150_000, 200_000]) {
      const q = computeQuote(cat, { model: "City", version: "Sport", downPayment: dp, termMonths: 48, paymentMethod: "financing" }, app.clock.now());
      expect(q.ok).toBe(true);
      if (q.ok) expect(q.quote.bonus).toBe(40_000);
    }
  });

  it("CR-V: el bono solo cambia por la regla explícita de financiera, no por el enganche", async () => {
    const cat = await loadCatalog(app.db, app.workspaceId);
    const financed = [100_000, 300_000].map((dp) => computeQuote(cat, { model: "CR-V", version: "Turbo Plus", downPayment: dp, termMonths: 48, paymentMethod: "financing" }, app.clock.now()));
    const cash = computeQuote(cat, { model: "CR-V", version: "Turbo Plus", downPayment: 0, termMonths: null, paymentMethod: "cash" }, app.clock.now());
    expect(financed.map((q) => (q.ok ? q.quote.bonus : null))).toEqual([40_000, 40_000]);
    expect(cash.ok && cash.quote.bonus).toBe(30_000);
  });

  it("en conversación, más enganche no promete más bono", async () => {
    const p = await newProspect(app, "Laura Méndez");
    await p.say("Me interesa el City Sport, tengo 80 mil de enganche, ¿cuánto quedaría a 48 meses?");
    const turn = await p.say("¿Y si doy 200 mil de enganche me dan más bono?");
    expect(turn.status).toBe("ok");
    expect(turn.reply).toContain("$40,000");
    expect(turn.reply).not.toMatch(/\$60,000|\$50,000/);
    const state = await p.state();
    expect(state.quotes[0]!.bonus).toBe(40_000);
    expect(state.quotes[0]!.downPayment).toBe(200_000);
  });

  it("si el modelo afirma que el bono sube con el enganche, el guardrail lo bloquea", async () => {
    const app2 = await makeApp(scripted((_ctx, attempt) => ({ customer_reply: `Con 200 mil de enganche tu bono sube a $60,000 (intento ${attempt}).` })));
    const p = await newProspect(app2);
    await p.say("Me interesa el City Sport");
    const turn = await p.say("Si doy 200 mil de enganche, ¿me dan más bono?");
    expect(turn.status).toBe("fallback");
    expect(turn.reply).not.toContain("60,000");
    expect(turn.guard.violations.map((v) => v.code)).toContain("expired_as_current");
    await app2.close();
  });
});
