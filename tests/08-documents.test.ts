/**
 * 8. No se pide toda la documentación de crédito inmediatamente.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mentionedDocumentTypes, nextDocumentToRequest } from "@/domain/documents";
import { buildPrompt, renderUserContent } from "@/server/agent/prompt";
import { buildTurnContext } from "@/server/agent/turn-context";
import * as s from "@/server/db/schema";
import { makeApp, newProspect, scripted, type TestApp } from "./helpers";

describe("documentación progresiva", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => app.close());

  it("la política entrega un documento a la vez y solo en etapas de crédito", () => {
    expect(nextDocumentToRequest("profiling", "financing", [])).toBeNull();
    expect(nextDocumentToRequest("financing", "cash", [])).toBeNull();
    expect(nextDocumentToRequest("documentation", "financing", [])).toBe("ine");
    expect(nextDocumentToRequest("documentation", "financing", [{ docType: "ine", status: "received" }])).toBe("proof_of_address");
  });

  it("al preguntar requisitos, Sofía pide solo el primer documento y registra una sola solicitud", async () => {
    const p = await newProspect(app, "Marta");
    await p.say("Me interesa el City Sport a crédito, tengo 80 mil de enganche");
    const turn = await p.say("¿Qué papeles necesito para el crédito?");
    expect(mentionedDocumentTypes(turn.reply).length).toBeLessThanOrEqual(1);
    expect(turn.reply).toMatch(/INE/);
    const state = await p.state();
    expect(state.documents).toHaveLength(1);
    expect(state.documents[0]!.docType).toBe("ine");
  });

  it("en perfilamiento (sin crédito) no se registran solicitudes de documentos", async () => {
    const p = await newProspect(app, "Beto");
    const turn = await p.say("¿Qué documentos piden?");
    expect(mentionedDocumentTypes(turn.reply)).toHaveLength(0);
    expect((await p.state()).documents).toHaveLength(0);
  });

  it("si el modelo pide toda la documentación de golpe, se bloquea y se pide solo un documento", async () => {
    const app2 = await makeApp(
      scripted(() => ({
        customer_reply: "Para el crédito mándame tu INE, comprobante de domicilio, estados de cuenta, recibos de nómina, RFC y CURP.",
      })),
    );
    const p = await newProspect(app2);
    await p.say("Quiero el City Sport a crédito con 80 mil de enganche");
    const turn = await p.say("¿Qué documentos necesitas?");
    expect(turn.guard.violations.map((v) => v.code)).toContain("document_overload");
    expect(mentionedDocumentTypes(turn.reply).length).toBeLessThanOrEqual(1);
    await app2.close();
  });

  it("el contenido/referencia de documentos sensibles nunca entra al prompt", async () => {
    const p = await newProspect(app, "Sensible");
    await app.db.insert(s.documents).values({
      workspaceId: app.workspaceId,
      customerId: p.customer.id,
      docType: "ine",
      status: "received",
      storageProvider: "local_private",
      storageBucket: "bucket-secreto",
      storageKey: "ruta/privada/ine-frente.jpg",
      sha256: "abc123deadbeef",
    });
    const res = await p.sayRaw("Ya te mandé mi INE");
    const ctx = await buildTurnContext(app.db, { workspaceId: app.workspaceId, conversationId: p.conversation.id, newMessageId: res.inboundMessageId, now: app.clock.now() });
    const prompt = renderUserContent(buildPrompt(ctx));
    expect(prompt).toContain("INE: received");
    expect(prompt).not.toContain("ruta/privada");
    expect(prompt).not.toContain("bucket-secreto");
    expect(prompt).not.toContain("abc123deadbeef");
  });
});
