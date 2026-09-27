/**
 * 6. La conversación puede continuar después de una intervención de Mario.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTurnContext } from "@/server/agent/turn-context";
import { buildPrompt, renderUserContent } from "@/server/agent/prompt";
import { makeApp, newProspect, scripted, type TestApp } from "./helpers";

describe("intervención de Mario", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("Sofía pausa mientras Mario atiende y retoma con su contexto y compromisos", async () => {
    const p = await newProspect(app, "Laura");
    await p.say("Hola, me interesa el City Sport, tengo 80 mil de enganche");

    await p.control("mario");
    const paused = await p.sayRaw("¿Me pueden respetar el bono si voy el sábado?");
    expect(paused.mode).toBe("mario");
    expect(paused.turn).toBeNull(); // Sofía no responde mientras Mario tiene el control

    const marioMsg = await p.mario("Laura, te respeto el bono de 40 mil y te veo el sábado a las 11 en la agencia.");
    await p.control("sofia");

    const turn = await p.say("Perfecto, ¿qué tengo que llevar el sábado?");
    expect(turn.status).toBe("ok");
    expect(turn.reply.length).toBeGreaterThan(0);
    expect(turn.reply).not.toMatch(/Soy Sofía, te escribo/); // no reinicia la conversación

    const state = await p.state();
    // El compromiso quedó registrado en la memoria de largo plazo, anclado al mensaje real de Mario.
    const commitment = state.summary!.commitments.find((c) => c.sourceMessageId === marioMsg.id);
    expect(commitment?.source).toBe("mario_message");
    // Todos los mensajes se conservan (auditoría), incluido el que llegó mientras Mario atendía.
    expect(state.messages.map((m) => m.sender)).toEqual(["customer", "sofia", "system", "customer", "mario", "system", "customer", "sofia"]);

    // El siguiente turno ve el mensaje de Mario y el compromiso en su contexto.
    const last = state.messages.at(-1)!;
    const ctx = await buildTurnContext(app.db, { workspaceId: app.workspaceId, conversationId: p.conversation.id, newMessageId: last.id, now: app.clock.now() });
    const prompt = renderUserContent(buildPrompt(ctx));
    expect(prompt).toContain("MARIO: Laura, te respeto el bono de 40 mil");
    expect(prompt).toContain("Compromisos realizados por Mario:\n- Laura, te respeto el bono");
    expect(ctx.marioIntervened).toBe(true);
  });

  it("sin intervención real, Sofía no puede decir que Mario aprobó algo", async () => {
    const app2 = await makeApp(scripted(() => ({ customer_reply: "Listo, Mario ya revisó y aprobó tu solicitud." })));
    const p = await newProspect(app2);
    const turn = await p.say("¿Ya lo vio Mario?");
    expect(turn.guard.violations.map((v) => v.code)).toContain("false_mario_claim");
    expect(turn.reply).not.toMatch(/aprobó/);
    await app2.close();
  });

  it("con una aprobación real de Mario, la conversación continúa con esa evidencia", async () => {
    const p = await newProspect(app, "Jorge");
    await p.say("Me interesa el City Sport");
    await p.say("¿Me haces un descuento extra?");
    const state = await p.state();
    const approval = state.approvals.find((a) => a.status === "pending")!;
    expect(approval.actionType).toBe("discount_request");

    const { decideApproval } = await import("@/server/services/mario");
    await decideApproval(app, approval.id, "rejected", "No hay margen adicional este mes.");
    const after = await p.state();
    expect(after.messages.at(-1)!.body).toMatch(/Mario rechazó/);

    const turn = await p.say("Ok, entonces ¿cómo seguimos?");
    expect(turn.status).toBe("ok");
    const ctx = await buildTurnContext(app.db, { workspaceId: app.workspaceId, conversationId: p.conversation.id, newMessageId: turn.replyMessageId, now: app.clock.now() });
    expect(ctx.marioIntervened).toBe(true);
  });
});
