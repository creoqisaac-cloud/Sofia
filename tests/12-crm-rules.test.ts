/**
 * Reglas de CRM: la IA propone etapa/temperatura; el backend valida y registra cuándo y por qué.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateStageTransition } from "@/domain/crm";
import { setCrmManually } from "@/server/services/customers";
import { makeApp, newProspect, type TestApp } from "./helpers";

describe("transiciones de etapa", () => {
  it.each([
    ["profiling", "quotation", "sofia", true],
    ["quotation", "profiling", "sofia", false], // retroceso
    ["closing", "sold", "sofia", false], // solo Mario
    ["closing", "sold", "mario", true],
    ["profiling", "test_drive", "sofia", true], // lateral
    ["closing", "appointment", "sofia", false], // lateral no retrocede un cierre
    ["test_drive", "negotiation", "sofia", true],
    ["financing", "not_interested", "sofia", true],
    ["not_interested", "profiling", "sofia", true], // reactivación
  ] as const)("%s → %s por %s: %s", (from, to, actor, ok) => {
    expect(validateStageTransition(from, to, actor).ok).toBe(ok);
  });
});

describe("historial CRM", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("cada cambio queda registrado con motivo, autor y estado anterior", async () => {
    const p = await newProspect(app, "Historial");
    await p.say("Hola, me interesa el City Sport, tengo 80 mil de enganche, ¿cuánto al mes a 48 meses?");
    await p.say("Quiero una prueba de manejo el sábado");
    await setCrmManually(app, p.customer.id, { stage: "negotiation", temperature: "hot", reason: "Mario habló por teléfono con el cliente." });

    const { crm } = await p.state();
    const [latest, ...older] = crm.history;
    expect(latest).toMatchObject({ stage: "negotiation", changedBy: "mario", reason: "Mario habló por teléfono con el cliente." });
    expect(older.every((h) => h.reason.length > 0)).toBe(true);
    expect(older.some((h) => h.changedBy === "sofia" && h.previousStage !== null)).toBe(true);
    expect(crm.history.at(-1)).toMatchObject({ stage: "new", changedBy: "mario", reason: "Prospecto creado." });

    // Una prueba de manejo pedida en negociación no retrocede la etapa.
    const turn = await p.say("¿Puedo manejarlo otra vez el domingo?");
    expect(turn.effects.crm.stageTo).toBe("negotiation");
  });
});
