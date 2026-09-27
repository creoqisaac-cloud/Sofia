/**
 * 2. Una promoción vencida no se trata como vigente.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { effectiveStatus } from "@/domain/knowledge";
import { detectIntents } from "@/domain/intents";
import { loadCatalog } from "@/server/commercial/catalog";
import { computeQuote } from "@/server/commercial/quoting";
import { retrieveCommercialContext } from "@/server/commercial/retrieval";
import { DAY_MS } from "@/server/lib/clock";
import { makeApp, newProspect, scripted, type TestApp } from "./helpers";

describe("información vencida", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("un dato 'confirmed' con vigencia pasada se vuelve histórico y no presentable", () => {
    const now = new Date("2026-09-27T00:00:00Z");
    const eff = effectiveStatus({ status: "confirmed", validFrom: new Date("2026-07-01"), validTo: new Date("2026-09-01") }, now);
    expect(eff.status).toBe("historical");
    expect(eff.expired).toBe(true);
    expect(eff.presentableAsCurrent).toBe(false);
    // Aún no vigente → no se presenta como vigente.
    const future = effectiveStatus({ status: "confirmed", validFrom: new Date("2026-10-15"), validTo: null }, now);
    expect(future.presentableAsCurrent).toBe(false);
  });

  it("la recuperación marca el bono vencido de HR-V como histórico y no lo cuenta como vigente", async () => {
    const cat = await loadCatalog(app.db, app.workspaceId);
    const ctx = retrieveCommercialContext(cat, { models: ["HR-V"], versionByModel: {}, intents: detectIntents("¿qué bono tiene la HR-V?"), paymentMethod: undefined, query: "bono", now: app.clock.now() });
    const bonus = ctx.items.find((i) => i.category === "bonus" && i.title.includes("HR-V"))!;
    expect(bonus.status).toBe("historical");
    expect(bonus.expired).toBe(true);
    expect(bonus.line).toContain("VENCIDO");
  });

  it("Sofía dice que el bono ya terminó; no lo ofrece como vigente", async () => {
    const p = await newProspect(app, "Pedro");
    const turn = await p.say("Hola, ¿qué bono tiene la HR-V?");
    expect(turn.status).toBe("ok");
    expect(turn.reply).toMatch(/ya terminó/);
    expect(turn.reply).toMatch(/no tengo un bono vigente/);
    expect(turn.knowledgeUsed.find((k) => k.title.includes("HR-V (campaña anterior)"))?.status).toBe("historical");
  });

  it("si el modelo presenta el bono vencido como vigente, se bloquea", async () => {
    const app2 = await makeApp(scripted(() => ({ customer_reply: "¡Claro! La HR-V tiene un bono de $35,000 este mes." })));
    const p = await newProspect(app2);
    const turn = await p.say("¿La HR-V tiene bono?");
    expect(turn.status).toBe("fallback");
    expect(turn.guard.violations.map((v) => v.code)).toContain("expired_as_current");
    expect(turn.reply).not.toContain("35,000");
    await app2.close();
  });

  it("no se cotiza con precio vencido ni con tasa vencida", async () => {
    const cat = await loadCatalog(app.db, app.workspaceId);
    const civic = computeQuote(cat, { model: "Civic", version: "Sport", downPayment: 100_000, termMonths: 48, paymentMethod: "financing" }, app.clock.now());
    expect(civic.ok).toBe(false);
    if (!civic.ok) expect(civic.reason).toBe("price_not_current");

    const city = computeQuote(cat, { model: "City", version: "Uniq", downPayment: 100_000, termMonths: 36, paymentMethod: "financing" }, app.clock.now());
    expect(city.ok && city.quote.annualRate).toBe(0.139); // no la tasa vencida de 11.9%
  });

  it("cuando pasa la vigencia, el bono deja de aplicarse automáticamente", async () => {
    const cat = await loadCatalog(app.db, app.workspaceId);
    const later = new Date(app.clock.now().getTime() + 50 * DAY_MS); // bono City vence a +45 días; precio también
    const q = computeQuote(cat, { model: "City", version: "Sport", downPayment: 80_000, termMonths: 48, paymentMethod: "financing" }, later);
    expect(q.ok).toBe(false); // el precio de lista también venció: no hay cotización "vigente"
  });
});
