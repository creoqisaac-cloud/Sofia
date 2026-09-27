/**
 * 7. Un cliente listo para cerrar produce la alerta "🔥 MARIO, ENTRA TÚ".
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeApp, newProspect, scripted, type TestApp } from "./helpers";

describe("alerta MARIO, ENTRA TÚ", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("cliente de cierre → alerta con todos los campos, etapa de cierre y temperatura muy caliente", async () => {
    const p = await newProspect(app, "Laura Méndez");
    await p.say("Hola, soy Laura. Me interesa el City Sport para la familia");
    await p.say("Tengo 80 mil de enganche, quiero pagar máximo 6 mil de mensualidad, ¿a 48 meses cuánto queda?");
    const turn = await p.say("Me encanta. Ya me decidí, ¿cuándo firmo? Lo quiero este mes");

    expect(turn.effects.alerts.map((a) => a.trigger)).toContain("ready_to_purchase");
    expect(turn.effects.crm.stageTo).toBe("closing");
    expect(turn.effects.crm.temperatureTo).toBe("very_hot");

    const state = await p.state();
    const alert = state.alerts.find((a) => a.trigger === "ready_to_purchase")!;
    expect(alert.title).toBe("🔥 MARIO, ENTRA TÚ");
    expect(alert.payload).toMatchObject({
      vehicle: "City",
      version: "Sport",
      downPayment: 80_000,
      monthlyTarget: 6_000,
      purchaseTiming: "Este mes",
      crmStage: "closing",
      temperature: "very_hot",
      creditStatus: "Sin solicitud",
    });
    expect(alert.payload.customer).toContain("Laura");
    expect(alert.payload.quoteStatus).toMatch(/Cotización previamente validada/);
    expect(alert.payload.reasonForEscalation.length).toBeGreaterThan(5);
    expect(alert.payload.recommendedNextStep.length).toBeGreaterThan(5);
    expect(alert.payload.shortSummary).toContain("City");
    expect(state.tags.map((t) => t.tag)).toContain("listo_para_cerrar");

    // No se duplica la alerta si el cliente insiste.
    const again = await p.say("¡Sí, lo quiero ya!");
    expect(again.effects.alerts.find((a) => a.trigger === "ready_to_purchase")?.deduplicated).toBe(true);
    const after = await p.state();
    expect(after.alerts.filter((a) => a.trigger === "ready_to_purchase")).toHaveLength(1);
  });

  it("pedir a Mario, crédito aprobado y descuento también generan alerta", async () => {
    const p = await newProspect(app, "Carlos");
    const t1 = await p.say("Quiero hablar con Mario directamente");
    expect(t1.effects.alerts.map((a) => a.trigger)).toContain("customer_requests_mario");
    const t2 = await p.say("Ya me aprobaron el crédito");
    expect(t2.effects.alerts.map((a) => a.trigger)).toContain("credit_approved");
    const t3 = await p.say("¿Me haces un descuento extra si pago hoy?");
    expect(t3.effects.alerts.map((a) => a.trigger)).toContain("discount_outside_rules");
    expect(t3.effects.approvals.map((a) => a.actionType)).toContain("discount_request");
    expect(t3.reply).not.toMatch(/te (lo )?(dejo|doy) en/); // Sofía no promete descuento
  });

  it("el modelo puede proponer escalar por criterio humano", async () => {
    const app2 = await makeApp(
      scripted(() => ({
        customer_reply: "Déjame consultarlo con Mario para darte la mejor opción.",
        requires_mario: true,
        escalation_reason: { trigger: "human_judgment", explanation: "El cliente compara con una oferta de otra agencia.", recommended_next_step: "Mario revisa la oferta de la competencia." },
      })),
    );
    const p = await newProspect(app2);
    const turn = await p.say("En otra agencia me ofrecen algo mejor, ¿qué me dices?");
    expect(turn.effects.alerts.map((a) => a.trigger)).toContain("human_judgment");
    await app2.close();
  });
});
