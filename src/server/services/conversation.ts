/**
 * Servicio de conversación, independiente del canal. Hoy lo usa el
 * simulador; el conector de WhatsApp (siguiente sprint) usará las mismas
 * funciones: registrar mensaje entrante → turno de Sofía → respuesta.
 */
import { and, desc, eq } from "drizzle-orm";
import type { ControlMode } from "@/domain/enums";
import { truncate } from "@/domain/text";
import type { AppContext } from "../app";
import { runSofiaTurn, type TurnResult } from "../agent/orchestrator";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { ServiceError } from "./customers";

async function loadConversation(app: AppContext, conversationId: string) {
  const [conversation] = await app.db
    .select()
    .from(s.conversations)
    .where(and(eq(s.conversations.id, conversationId), eq(s.conversations.workspaceId, app.workspaceId)));
  if (!conversation) throw new ServiceError("Conversación no encontrada.", 404);
  return conversation;
}

async function insertMessage(db: Db, app: AppContext, conversation: typeof s.conversations.$inferSelect, sender: "customer" | "mario" | "system", body: string) {
  const [msg] = await db
    .insert(s.messages)
    .values({ workspaceId: app.workspaceId, conversationId: conversation.id, customerId: conversation.customerId, sender, body })
    .returning();
  await db.update(s.conversations).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(s.conversations.id, conversation.id));
  return msg!;
}

export type CustomerMessageResult =
  | { mode: "sofia"; inboundMessageId: string; turn: TurnResult }
  | { mode: "mario"; inboundMessageId: string; turn: null };

/** Mensaje entrante del cliente. Si Mario tiene el control, Sofía no responde. */
export async function postCustomerMessage(app: AppContext, conversationId: string, body: string): Promise<CustomerMessageResult> {
  const text = body.trim();
  if (!text) throw new ServiceError("El mensaje está vacío.");
  if (text.length > 4000) throw new ServiceError("El mensaje es demasiado largo.");
  const conversation = await loadConversation(app, conversationId);
  const inbound = await insertMessage(app.db, app, conversation, "customer", text);
  if (conversation.controlMode === "mario") {
    return { mode: "mario", inboundMessageId: inbound.id, turn: null };
  }
  const turn = await runSofiaTurn(app, { conversationId, inboundMessageId: inbound.id });
  return { mode: "sofia", inboundMessageId: inbound.id, turn };
}

/** Mensaje escrito por Mario. Mario toma el control automáticamente. */
export async function postMarioMessage(app: AppContext, conversationId: string, body: string) {
  const text = body.trim();
  if (!text) throw new ServiceError("El mensaje está vacío.");
  const conversation = await loadConversation(app, conversationId);
  return app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    if (conversation.controlMode !== "mario") {
      await tx.update(s.conversations).set({ controlMode: "mario", controlChangedAt: new Date() }).where(eq(s.conversations.id, conversationId));
      await insertMessage(tx, app, conversation, "system", "Mario tomó la conversación.");
    }
    const msg = await insertMessage(tx, app, conversation, "mario", text);
    await tx.insert(s.auditEvents).values({
      workspaceId: app.workspaceId,
      customerId: conversation.customerId,
      actorType: "mario",
      eventType: "mario_message",
      entityType: "message",
      entityId: msg.id,
      data: {},
    });
    return msg;
  });
}

export async function setControlMode(app: AppContext, conversationId: string, mode: ControlMode) {
  const conversation = await loadConversation(app, conversationId);
  if (conversation.controlMode === mode) return conversation;
  return app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [updated] = await tx
      .update(s.conversations)
      .set({ controlMode: mode, controlChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(s.conversations.id, conversationId))
      .returning();
    await insertMessage(tx, app, conversation, "system", mode === "mario" ? "Mario tomó la conversación." : "Mario devolvió la conversación; Sofía la retoma.");
    await tx.insert(s.auditEvents).values({
      workspaceId: app.workspaceId,
      customerId: conversation.customerId,
      actorType: "mario",
      eventType: "control_mode_changed",
      entityType: "conversation",
      entityId: conversationId,
      data: { mode },
    });
    return updated!;
  });
}

/** Compromiso registrado manualmente por Mario (queda en la memoria de largo plazo). */
export async function addManualCommitment(app: AppContext, customerId: string, text: string) {
  const clean = text.trim();
  if (!clean) throw new ServiceError("El compromiso está vacío.");
  const [prev] = await app.db
    .select()
    .from(s.customerSummaries)
    .where(eq(s.customerSummaries.customerId, customerId))
    .orderBy(desc(s.customerSummaries.version))
    .limit(1);
  const commitments: s.Commitment[] = [
    ...(prev?.commitments ?? []),
    { text: truncate(clean, 240), source: "mario_manual", sourceMessageId: null, createdAt: app.clock.now().toISOString(), status: "open" },
  ];
  await app.db.insert(s.customerSummaries).values({
    workspaceId: app.workspaceId,
    customerId,
    summary: prev?.summary ?? "",
    commitments,
    pendingItems: prev?.pendingItems ?? [],
    nextAction: prev?.nextAction ?? null,
    coversUntilMessageId: prev?.coversUntilMessageId ?? null,
    messageCount: prev?.messageCount ?? 0,
    version: (prev?.version ?? 0) + 1,
  });
}
