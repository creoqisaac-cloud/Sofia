/**
 * Puente WhatsApp → CRM/Conversaciones/Sofía → WhatsApp.
 * Dedupe persistente por wamid; reintento de respuestas no entregadas; modo Mario.
 * NO confirma citas: el motor actual crea propuestas sin scheduledAt ni calendario.
 */
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { AppContext } from "@/server/app";
import * as s from "@/server/db/schema";
import { runSofiaTurn } from "@/server/agent/orchestrator";
import { createCustomer } from "@/server/services/customers";
import { logger } from "@/server/lib/logger";
import { sendMetaText, type WhatsAppText } from "./meta";

export interface WhatsAppRuntimeConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion: string;
  autoReply: boolean;
}
export type DeliveryResult = "sent" | "duplicate" | "manual" | "busy";

export function normalizeWhatsAppPhone(from: string): string {
  const digits = from.replace(/\D/g, "");
  // WhatsApp a veces usa 521 + diez dígitos para México; unificar con 52 + diez dígitos.
  return /^521\d{10}$/.test(digits) ? `52${digits.slice(3)}` : digits;
}

async function findOrCreateConversation(app: AppContext, input: WhatsAppText) {
  const phone = normalizeWhatsAppPhone(input.from);
  if (!/^\d{10,15}$/.test(phone)) throw new Error("Número WhatsApp inválido.");
  const candidates = [phone];
  if (/^52\d{10}$/.test(phone)) candidates.push(phone.slice(2));
  let [customer] = await app.db.select().from(s.customers).where(and(
    eq(s.customers.workspaceId, app.workspaceId), inArray(s.customers.phone, candidates),
  )).limit(1);
  if (!customer) {
    try {
      const created = await createCustomer(app, { displayName: input.name?.trim() || "Prospecto de WhatsApp", phone });
      customer = created.customer;
      await app.db.update(s.customers).set({ source: "whatsapp" }).where(eq(s.customers.id, customer.id));
      await app.db.update(s.conversations).set({ channel: "whatsapp" }).where(eq(s.conversations.id, created.conversation.id));
      return { customerId: customer.id, conversationId: created.conversation.id, mode: created.conversation.controlMode };
    } catch (error) {
      // Dos mensajes del mismo cliente pueden intentar crearlo simultáneamente.
      [customer] = await app.db.select().from(s.customers).where(and(
        eq(s.customers.workspaceId, app.workspaceId), inArray(s.customers.phone, candidates),
      )).limit(1);
      if (!customer) throw error;
    }
  }
  const [conversation] = await app.db.select().from(s.conversations).where(and(
    eq(s.conversations.customerId, customer.id), eq(s.conversations.workspaceId, app.workspaceId),
    eq(s.conversations.channel, "whatsapp"),
  )).limit(1);
  if (conversation) return { customerId: customer.id, conversationId: conversation.id, mode: conversation.controlMode };
  const [created] = await app.db.insert(s.conversations).values({
    workspaceId: app.workspaceId, customerId: customer.id, channel: "whatsapp",
  }).onConflictDoNothing().returning();
  if (created) return { customerId: customer.id, conversationId: created.id, mode: created.controlMode };
  const [concurrent] = await app.db.select().from(s.conversations).where(and(
    eq(s.conversations.customerId, customer.id), eq(s.conversations.channel, "whatsapp"),
  )).limit(1);
  if (!concurrent) throw new Error("No se pudo recuperar la conversación de WhatsApp.");
  return { customerId: customer.id, conversationId: concurrent.id, mode: concurrent.controlMode };
}

/** Return false when another delivery owns a non-expired processing lease. */
async function claimEvent(app: AppContext, message: WhatsAppText): Promise<boolean> {
  const now = app.clock.now();
  await app.db.insert(s.whatsappInboundEvents).values({
    id: message.id, workspaceId: app.workspaceId, phone: normalizeWhatsAppPhone(message.from), state: "received",
  }).onConflictDoNothing();
  const [claimed] = await app.db.update(s.whatsappInboundEvents).set({
    state: "processing", leaseUntil: new Date(now.getTime() + 120_000), updatedAt: now,
  }).where(and(
    eq(s.whatsappInboundEvents.id, message.id), eq(s.whatsappInboundEvents.workspaceId, app.workspaceId),
    or(inArray(s.whatsappInboundEvents.state, ["received", "retry"]),
      and(eq(s.whatsappInboundEvents.state, "processing"), lt(s.whatsappInboundEvents.leaseUntil, now))),
  )).returning({ id: s.whatsappInboundEvents.id });
  return Boolean(claimed);
}

async function recordIncoming(app: AppContext, conversationId: string, customerId: string, msg: WhatsAppText): Promise<string> {
  const [existing] = await app.db.select({ id: s.messages.id }).from(s.messages).where(
    sql`${s.messages.metadata}->>'whatsappMessageId' = ${msg.id}`,
  ).limit(1);
  if (existing) return existing.id;
  const [inserted] = await app.db.insert(s.messages).values({
    workspaceId: app.workspaceId, conversationId, customerId, sender: "customer", body: msg.body,
    metadata: { whatsappMessageId: msg.id },
  }).onConflictDoNothing().returning({ id: s.messages.id });
  if (!inserted) {
    const [again] = await app.db.select({ id: s.messages.id }).from(s.messages).where(
      sql`${s.messages.metadata}->>'whatsappMessageId' = ${msg.id}`,
    ).limit(1);
    if (!again) throw new Error("No se pudo recuperar el mensaje de WhatsApp.");
    return again.id;
  }
  await app.db.update(s.conversations).set({ lastMessageAt: app.clock.now(), updatedAt: app.clock.now() })
    .where(and(eq(s.conversations.id, conversationId), eq(s.conversations.workspaceId, app.workspaceId)));
  return inserted.id;
}

export async function processWhatsAppMessage(app: AppContext, msg: WhatsAppText, cfg: WhatsAppRuntimeConfig): Promise<DeliveryResult> {
  if (!await claimEvent(app, msg)) {
    const [row] = await app.db.select({ state: s.whatsappInboundEvents.state }).from(s.whatsappInboundEvents)
      .where(eq(s.whatsappInboundEvents.id, msg.id)).limit(1);
    return row?.state === "sent" || row?.state === "manual" ? "duplicate" : "busy";
  }
  try {
    const target = await findOrCreateConversation(app, msg);
    const [event] = await app.db.select().from(s.whatsappInboundEvents).where(eq(s.whatsappInboundEvents.id, msg.id)).limit(1);
    const inboundId = event?.inboundMessageId ?? await recordIncoming(app, target.conversationId, target.customerId, msg);
    if (!event?.inboundMessageId) {
      await app.db.update(s.whatsappInboundEvents).set({ inboundMessageId: inboundId }).where(eq(s.whatsappInboundEvents.id, msg.id));
    }
    // Modo supervisado: no enviar desde el servidor si Mario tiene el control
    // ni usar respuestas con promociones DEMO en contactos reales.
    const [current] = await app.db.select({ controlMode: s.conversations.controlMode }).from(s.conversations)
      .where(eq(s.conversations.id, target.conversationId)).limit(1);
    if (current?.controlMode === "mario" || !cfg.autoReply || app.provider.name === "demo") {
      await app.db.update(s.customers).set({ responseStatus: "waiting_mario", updatedAt: app.clock.now() }).where(eq(s.customers.id, target.customerId));
      await app.db.update(s.whatsappInboundEvents).set({ state: "manual", leaseUntil: null, updatedAt: app.clock.now() }).where(eq(s.whatsappInboundEvents.id, msg.id));
      return "manual";
    }

    let replyId = event?.replyMessageId ?? null;
    if (!replyId) {
      const [existingRun] = await app.db.select({ replyMessageId: s.agentRuns.replyMessageId }).from(s.agentRuns)
        .where(and(eq(s.agentRuns.inboundMessageId, inboundId), eq(s.agentRuns.workspaceId, app.workspaceId))).limit(1);
      replyId = existingRun?.replyMessageId ?? (await runSofiaTurn(app, {
        conversationId: target.conversationId, inboundMessageId: inboundId,
      })).replyMessageId;
      await app.db.update(s.whatsappInboundEvents).set({ replyMessageId: replyId }).where(eq(s.whatsappInboundEvents.id, msg.id));
    }
    const [reply] = await app.db.select({ body: s.messages.body }).from(s.messages)
      .where(and(eq(s.messages.id, replyId), eq(s.messages.conversationId, target.conversationId))).limit(1);
    if (!reply) throw new Error("Respuesta del asistente no encontrada.");
    const outboundId = await sendMetaText({
      phoneNumberId: cfg.phoneNumberId, accessToken: cfg.accessToken,
      apiVersion: cfg.apiVersion, to: msg.from, body: reply.body,
    });
    await app.db.update(s.whatsappInboundEvents).set({
      state: "sent", outboundMessageId: outboundId, leaseUntil: null, updatedAt: app.clock.now(),
    }).where(eq(s.whatsappInboundEvents.id, msg.id));
    return "sent";
  } catch (error) {
    await app.db.update(s.whatsappInboundEvents).set({
      state: "retry", leaseUntil: null, updatedAt: app.clock.now(),
    }).where(eq(s.whatsappInboundEvents.id, msg.id));
    logger.error("whatsapp.process_failed", { error: error instanceof Error ? error.message : "error" });
    throw error;
  }
}
