/**
 * 10. La memoria de largo plazo no requiere reenviar todo el historial.
 * + Persistencia: cerrar la app, reabrir y continuar exactamente donde se quedó.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPrompt, renderUserContent } from "@/server/agent/prompt";
import { buildTurnContext, MEMORY_WINDOW } from "@/server/agent/turn-context";
import * as s from "@/server/db/schema";
import { getCustomerState } from "@/server/services/customers";
import { postCustomerMessage } from "@/server/services/conversation";
import { makeApp, newProspect, type TestApp } from "./helpers";

async function seedHistory(app: TestApp, p: Awaited<ReturnType<typeof newProspect>>, pairs: number) {
  for (let i = 1; i <= pairs; i++) {
    await app.db.insert(s.messages).values([
      { workspaceId: app.workspaceId, conversationId: p.conversation.id, customerId: p.customer.id, sender: "customer", body: `MENSAJE-HISTORICO-${String(i).padStart(3, "0")} del cliente` },
      { workspaceId: app.workspaceId, conversationId: p.conversation.id, customerId: p.customer.id, sender: "sofia", body: `Respuesta histórica ${i}` },
    ]);
  }
}

describe("memoria por capas", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("el contexto usa una ventana fija de mensajes + perfil + resumen, no todo el historial", async () => {
    const p = await newProspect(app, "Historial Largo");
    await p.say("Me interesa el City Sport para la familia");
    await seedHistory(app, p, 60);
    const res = await p.sayRaw("¿Cuánto cuesta?");
    const ctx = await buildTurnContext(app.db, { workspaceId: app.workspaceId, conversationId: p.conversation.id, newMessageId: res.turn!.replyMessageId, now: app.clock.now() });
    const prompt = renderUserContent(buildPrompt(ctx));

    expect(ctx.totalMessages).toBeGreaterThan(120);
    expect(ctx.recentMessages.length).toBeLessThanOrEqual(MEMORY_WINDOW);
    expect(prompt).not.toContain("MENSAJE-HISTORICO-001");
    expect(prompt).toContain(`omitted_earlier="${ctx.totalMessages - ctx.recentMessages.length}"`);
    // La información antigua sigue disponible vía memoria estructurada.
    expect(prompt).toContain("Modelo de interés: City");
    expect(prompt).toContain("Resumen acumulado");
    // Todo el historial sigue guardado para auditoría.
    const state = await getCustomerState(app, p.customer.id);
    expect(state.messages.length).toBe(ctx.totalMessages);
  });

  it("el tamaño del prompt no crece con la longitud del historial", async () => {
    const short = await newProspect(app, "Corto");
    await seedHistory(app, short, 10);
    const long = await newProspect(app, "Largo");
    await seedHistory(app, long, 200);
    const sizes: number[] = [];
    for (const p of [short, long]) {
      const res = await p.sayRaw("Me interesa el City");
      const ctx = await buildTurnContext(app.db, { workspaceId: app.workspaceId, conversationId: p.conversation.id, newMessageId: res.inboundMessageId, now: app.clock.now() });
      sizes.push(renderUserContent(buildPrompt(ctx)).length);
    }
    expect(Math.abs(sizes[1]! - sizes[0]!)).toBeLessThan(600);
  });
});

describe("persistencia entre reinicios", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sofia-pglite-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("cerrar la app, volver a abrirla y continuar exactamente donde se quedó", async () => {
    const app1 = await makeApp(undefined, dir);
    const p = await newProspect(app1, "Laura Reinicio");
    await p.say("Hola, me interesa el City Sport para la familia, somos 4");
    const t2 = await p.say("Tengo 80 mil de enganche, ¿cuánto quedaría a 48 meses?");
    const before = await getCustomerState(app1, p.customer.id);
    await app1.close();

    const app2 = await makeApp(undefined, dir);
    const reopened = await getCustomerState(app2, p.customer.id);
    expect(reopened.messages.map((m) => m.body)).toEqual(before.messages.map((m) => m.body));
    expect(reopened.crm.stage).toBe(before.crm.stage);
    expect(reopened.crm.temperature).toBe(before.crm.temperature);
    expect(reopened.summary?.text).toBe(before.summary?.text);
    expect(reopened.profile.knownFacts).toEqual(before.profile.knownFacts);
    expect(reopened.quotes[0]?.id).toBe(before.quotes[0]?.id);
    expect(t2.reply).toContain("$5,890");

    const res = await postCustomerMessage(app2, p.conversation.id, "Ok, ¿y qué sigue?");
    expect(res.turn!.status).toBe("ok");
    expect(res.turn!.reply).not.toMatch(/Soy Sofía, te escribo/); // no reinicia la conversación
    expect(res.turn!.reply).not.toMatch(/enganche|qué modelo|cuántas personas/i); // no pide lo que ya sabe
    await app2.close();
  });
});
