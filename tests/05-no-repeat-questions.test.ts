/**
 * 5. Un dato proporcionado anteriormente no se vuelve a solicitar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeMissingFacts, FACT_DEFS } from "@/domain/facts";
import { guardReply } from "@/domain/guards";
import { normalize, splitSentences } from "@/domain/text";
import { makeApp, newProspect, scripted, type TestApp } from "./helpers";

function asksFor(reply: string, key: keyof typeof FACT_DEFS): boolean {
  return splitSentences(reply)
    .filter((s) => s.includes("?"))
    .some((s) => FACT_DEFS[key].askPatterns.some((re) => re.test(normalize(s))));
}

describe("no volver a preguntar", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("los datos faltantes nunca incluyen datos conocidos", () => {
    const missing = computeMissingFacts(
      { vehicle_interest: "City", usage_type: ["family"], passengers: 4, payment_method: "financing", down_payment: 80_000 },
      { nameKnown: true, hybridAvailableForInterest: false },
    ).map((m) => m.key);
    for (const k of ["vehicle_interest", "usage_type", "passengers", "payment_method", "down_payment", "name"]) expect(missing).not.toContain(k);
  });

  it("a lo largo de la conversación, Sofía no vuelve a pedir lo que ya sabe", async () => {
    const p = await newProspect(app, "Laura");
    const known = new Set<string>();
    const script: Array<[string, Array<keyof typeof FACT_DEFS>]> = [
      ["Hola, me interesa el City", ["vehicle_interest"]],
      ["Es para la familia, somos 4", ["usage_type", "passengers"]],
      ["Lo quiero con crédito, tengo 80 mil de enganche", ["payment_method", "down_payment"]],
      ["Manejo más en ciudad", ["driving_profile"]],
      ["Lo quiero para este mes", ["purchase_timing"]],
      ["Ok, ¿qué más necesitas saber?", []],
    ];
    for (const [text, adds] of script) {
      const turn = await p.say(text);
      adds.forEach((a) => known.add(a));
      for (const k of known) expect(asksFor(turn.reply, k as keyof typeof FACT_DEFS), `volvió a preguntar ${k}: ${turn.reply}`).toBe(false);
    }
  });

  it("guardrail: elimina la pregunta repetida y conserva el resto del mensaje", () => {
    const r = guardReply("Perfecto, Laura. ¿Con cuánto de enganche te gustaría arrancar? ¿Qué día te acomoda para la prueba de manejo?", {
      allowedAmounts: [],
      historicalAmounts: [],
      allowedPercents: [],
      historicalPercents: [],
      customerAmounts: [],
      estimateAmounts: [],
      officialQuoteAvailable: false,
      marioEvidence: false,
      knownFactKeys: ["down_payment"],
      confirmedAvailability: false,
      confirmedWarranty: false,
    });
    expect(r.blocked).toBe(false);
    expect(r.finalReply).not.toMatch(/enganche/);
    expect(r.finalReply).toMatch(/prueba de manejo/);
    expect(r.violations[0]!.code).toBe("repeated_question");
  });

  it("guardrail: una pregunta de confirmación sí se permite", () => {
    const r = guardReply("¿Sigues con la idea de 80 mil de enganche?", {
      allowedAmounts: [],
      historicalAmounts: [],
      allowedPercents: [],
      historicalPercents: [],
      customerAmounts: [80_000],
      estimateAmounts: [],
      officialQuoteAvailable: false,
      marioEvidence: false,
      knownFactKeys: ["down_payment"],
      confirmedAvailability: false,
      confirmedWarranty: false,
    });
    expect(r.violations).toHaveLength(0);
  });

  it("si el modelo vuelve a preguntar un dato conocido, la pregunta no llega al cliente", async () => {
    const app2 = await makeApp(scripted((ctx) => (ctx.totalMessages > 2 ? { customer_reply: "Va. ¿Qué modelo tienes en mente?" } : {})));
    const p = await newProspect(app2);
    await p.say("Me interesa la HR-V");
    const turn = await p.say("Es para trabajo");
    expect(turn.reply).not.toMatch(/qué modelo/i);
    expect(turn.guard.violations.map((v) => v.code)).toContain("repeated_question");
    await app2.close();
  });
});
