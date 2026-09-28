/**
 * 9. Las actualizaciones de perfil preservan hechos anteriores compatibles.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mergeProfile } from "@/domain/facts";
import * as s from "@/server/db/schema";
import { makeApp, newProspect, scripted, type TestApp } from "./helpers";

describe("fusión de perfil (dominio)", () => {
  it("listas se acumulan, valores únicos se reemplazan, lo compatible se conserva", () => {
    const base = { vehicle_interest: "City", usage_type: ["family"], desired_features: ["cámara de reversa"], budget: 350_000 };
    const { profile, changes } = mergeProfile(base, [
      { key: "desired_features", value: ["pantalla táctil"] },
      { key: "usage_type", value: ["work"] },
      { key: "budget", value: 380_000 },
      { key: "vehicle_interest", value: "City" },
    ]);
    expect(profile.desired_features).toEqual(["cámara de reversa", "pantalla táctil"]);
    expect(profile.usage_type).toEqual(["family", "work"]);
    expect(profile.budget).toBe(380_000);
    expect(profile.vehicle_interest).toBe("City");
    expect(changes.find((c) => c.key === "budget")?.action).toBe("superseded");
    expect(changes.find((c) => c.key === "vehicle_interest")?.action).toBe("reinforced");
  });

  it("cambiar de modelo retira la versión incompatible pero conserva lo demás", () => {
    const { profile } = mergeProfile({ vehicle_interest: "City", version: "Sport", passengers: 4 }, [{ key: "vehicle_interest", value: "HR-V" }]);
    expect(profile).toEqual({ vehicle_interest: "HR-V", passengers: 4 });
  });
});

describe("fusión de perfil (persistencia)", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("conserva hechos compatibles entre turnos y guarda el historial de los reemplazados", async () => {
    const p = await newProspect(app, "Laura");
    await p.say("Me interesa el City, es para la familia, quiero cámara de reversa");
    await p.say("También me gustaría pantalla con CarPlay y mi presupuesto es de 350 mil");
    await p.say("Mejor mi presupuesto es de 380 mil");

    const state = await p.state();
    const facts = Object.fromEntries(state.profile.knownFacts.map((f) => [f.key, f.value]));
    expect(facts.vehicle_interest).toBe("City");
    expect(facts.usage_type).toBe("Familiar");
    expect(facts.desired_features).toContain("cámara de reversa");
    expect(facts.desired_features).toContain("Apple CarPlay / Android Auto");
    expect(facts.budget).toBe("$380,000");

    const budgetRows = await app.db
      .select()
      .from(s.customerFacts)
      .where(and(eq(s.customerFacts.customerId, p.customer.id), eq(s.customerFacts.factKey, "budget")));
    expect(budgetRows.map((r) => [r.value, r.status]).sort()).toEqual([
      [350_000, "superseded"],
      [380_000, "observed"],
    ]);
    expect(budgetRows.every((r) => r.sourceMessageId)).toBe(true);
  });

  it("un hecho sin evidencia en lo que dijo el cliente se rechaza (no se inventa)", async () => {
    const app2 = await makeApp(
      scripted(() => ({
        observed_facts: [
          { key: "down_payment", value: "90000", numeric_value: 90_000, evidence: "tengo 90 mil", confidence: "high" },
          { key: "payment_method", value: "leasing", numeric_value: null, evidence: "leasing", confidence: "high" },
        ],
      })),
    );
    const p = await newProspect(app2);
    const turn = await p.say("Hola, me interesa el City");
    expect(turn.effects.facts.rejected.map((r) => r.what)).toEqual(expect.arrayContaining(["fact:down_payment", "fact:payment_method"]));
    const state = await p.state();
    expect(state.profile.knownFacts.find((f) => f.key === "down_payment")).toBeUndefined();
    await app2.close();
  });
});
