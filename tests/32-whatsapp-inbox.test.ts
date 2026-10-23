import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { processWhatsAppMessage } from "@/server/whatsapp/service";
import * as s from "@/server/db/schema";
import { makeApp, type TestApp } from "./helpers";

describe("Webhook de WhatsApp persistido en Sofía", () => {
  let app: TestApp;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });

  const config = { phoneNumberId: "123456", accessToken: "inutilizado-en-pruebas", apiVersion: "v26.0", autoReply: false };

  it("crea un prospecto real de canal WhatsApp sin enviar una respuesta no autorizada", async () => {
    const text = { id: "wamid.unit-1", from: "5218112345678", name: "Cliente WA", body: "Quiero una CR-V, ¿qué horario tienen?" };
    expect(await processWhatsAppMessage(app, text, config)).toBe("manual");
    expect(await processWhatsAppMessage(app, text, config)).toBe("duplicate");
    const [customer] = await app.db.select().from(s.customers)
      .where(and(eq(s.customers.workspaceId, app.workspaceId), eq(s.customers.phone, "528112345678")));
    expect(customer?.source).toBe("whatsapp");
    expect(customer?.responseStatus).toBe("waiting_mario");
    const [conversation] = await app.db.select().from(s.conversations).where(and(
      eq(s.conversations.customerId, customer!.id), eq(s.conversations.channel, "whatsapp"),
    ));
    expect(conversation).toBeDefined();
    const messages = await app.db.select().from(s.messages).where(eq(s.messages.conversationId, conversation!.id));
    expect(messages).toHaveLength(1);
    expect(messages[0]?.sender).toBe("customer");
    const events = await app.db.select().from(s.whatsappInboundEvents).where(eq(s.whatsappInboundEvents.id, text.id));
    expect(events[0]?.state).toBe("manual");
  });

  it("no activa el motor DEMO en conversaciones reales aunque se solicite auto reply", async () => {
    const text = { id: "wamid.unit-2", from: "5218112345678", name: "Cliente WA", body: "¿Tienen City?" };
    const result = await processWhatsAppMessage(app, text, { ...config, autoReply: true });
    expect(result).toBe("manual");
    const [customer] = await app.db.select().from(s.customers).where(eq(s.customers.phone, "528112345678"));
    const conversations = await app.db.select().from(s.conversations).where(and(
      eq(s.conversations.customerId, customer!.id), eq(s.conversations.channel, "whatsapp"),
    ));
    expect(conversations).toHaveLength(1);
    const messages = await app.db.select().from(s.messages).where(eq(s.messages.conversationId, conversations[0]!.id));
    expect(messages.filter((m) => m.sender === "customer")).toHaveLength(2);
    expect(messages.some((m) => m.sender === "sofia")).toBe(false);
  });
});
