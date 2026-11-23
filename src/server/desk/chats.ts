/**
 * Chats de Sofía web (WhatsApp sin API).
 *
 * Mario pega lo que le escribió el cliente (uno o varios mensajes, con o sin el formato de
 * WhatsApp), Sofía lo entiende junto, contesta UNA vez con texto + fotos/videos y Mario lo
 * manda con un toque. También sirve para registrar lo que Mario ya contestó él mismo.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { isModelTag, tagLabel } from "@/domain/tags";
import { parsePastedChat } from "@/domain/whatsapp-paste";
import type { AppContext } from "../app";
import { runSofiaTurn } from "../agent/orchestrator";
import * as s from "../db/schema";
import { createCustomer } from "../services/customers";
import { ServiceError } from "../services/errors";
import { getMediaByIds } from "./media";
import { syncCustomerBoard } from "./pipeline";
import { loadStyle } from "./style";

const cleanName = (n: string) => n.replace(/\s*\(DEMO\)\s*/gi, " ").trim();

export async function listChats(app: AppContext, opts: { q?: string } = {}) {
  const rows = await app.db
    .select({
      customerId: s.customers.id,
      name: s.customers.displayName,
      phone: s.customers.phone,
      conversationId: s.conversations.id,
      controlMode: s.conversations.controlMode,
      lastMessageAt: s.conversations.lastMessageAt,
      createdAt: s.customers.createdAt,
      temperature: s.crmStates.temperature,
      stage: s.crmStates.stage,
    })
    .from(s.customers)
    .innerJoin(s.conversations, eq(s.conversations.customerId, s.customers.id))
    .leftJoin(s.crmStates, and(eq(s.crmStates.customerId, s.customers.id), eq(s.crmStates.isCurrent, true)))
    .where(and(eq(s.customers.workspaceId, app.workspaceId), isNull(s.customers.archivedAt)))
    .orderBy(desc(sql`coalesce(${s.conversations.lastMessageAt}, ${s.customers.createdAt})`))
    .limit(400);
  const convIds = rows.map((r) => r.conversationId);
  const last = convIds.length
    ? await app.db
        .selectDistinctOn([s.messages.conversationId], { conversationId: s.messages.conversationId, sender: s.messages.sender, body: s.messages.body, createdAt: s.messages.createdAt, metadata: s.messages.metadata })
        .from(s.messages)
        .where(and(inArray(s.messages.conversationId, convIds), inArray(s.messages.sender, ["customer", "sofia", "mario"])))
        .orderBy(s.messages.conversationId, desc(s.messages.seq))
    : [];
  const lastMap = new Map(last.map((m) => [m.conversationId, m]));
  const tags = rows.length
    ? await app.db
        .select({ customerId: s.customerTags.customerId, tag: s.customerTags.tag })
        .from(s.customerTags)
        .where(and(eq(s.customerTags.workspaceId, app.workspaceId), isNull(s.customerTags.removedAt)))
    : [];
  const modelMap = new Map<string, string[]>();
  for (const t of tags) if (isModelTag(t.tag)) modelMap.set(t.customerId, [...(modelMap.get(t.customerId) ?? []), tagLabel(t.tag)]);
  const pending = await app.db
    .select({ customerId: s.outboxMessages.customerId, n: sql<number>`count(*)::int` })
    .from(s.outboxMessages)
    .where(and(eq(s.outboxMessages.workspaceId, app.workspaceId), eq(s.outboxMessages.status, "pending")))
    .groupBy(s.outboxMessages.customerId);
  const pendingMap = new Map(pending.map((p) => [p.customerId, Number(p.n)]));

  // Un cliente puede tener varias conversaciones (simulador, WhatsApp): se muestra la más reciente.
  const seen = new Set<string>();
  const q = opts.q?.trim().toLowerCase();
  return rows
    .filter((r) => (seen.has(r.customerId) ? false : (seen.add(r.customerId), true)))
    .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.phone ?? "").includes(q.replace(/\D/g, "") || "§"))
    .map((r) => {
      const m = lastMap.get(r.conversationId);
      const replyPending = m?.sender === "sofia" && (m.metadata as { delivered?: boolean; outboxId?: string }).delivered !== true && !(m.metadata as { outboxId?: string }).outboxId;
      return {
        customerId: r.customerId,
        conversationId: r.conversationId,
        name: cleanName(r.name),
        phone: r.phone,
        controlMode: r.controlMode,
        temperature: r.temperature ?? "cold",
        stage: r.stage ?? "new",
        models: modelMap.get(r.customerId) ?? [],
        last: m ? { sender: m.sender, body: m.body.slice(0, 140), at: m.createdAt } : null,
        /** El cliente escribió al último: hay que contestar. */
        needsReply: m?.sender === "customer",
        /** Sofía ya redactó respuesta pero Mario no la ha mandado. */
        replyPending,
        pendingOutbox: pendingMap.get(r.customerId) ?? 0,
        at: r.lastMessageAt ?? r.createdAt,
      };
    });
}
export type ChatListItem = Awaited<ReturnType<typeof listChats>>[number];

async function conversationFor(app: AppContext, customerId: string) {
  const [conv] = await app.db
    .select()
    .from(s.conversations)
    .where(and(eq(s.conversations.customerId, customerId), eq(s.conversations.workspaceId, app.workspaceId)))
    .orderBy(desc(s.conversations.lastMessageAt))
    .limit(1);
  if (conv) return conv;
  const [created] = await app.db.insert(s.conversations).values({ workspaceId: app.workspaceId, customerId, channel: "whatsapp" }).returning();
  return created!;
}

export async function getChat(app: AppContext, customerId: string) {
  const [customer] = await app.db.select().from(s.customers).where(and(eq(s.customers.id, customerId), eq(s.customers.workspaceId, app.workspaceId)));
  if (!customer) throw new ServiceError("Cliente no encontrado.", 404);
  const conv = await conversationFor(app, customerId);
  const msgs = (
    await app.db
      .select({ id: s.messages.id, sender: s.messages.sender, body: s.messages.body, metadata: s.messages.metadata, createdAt: s.messages.createdAt })
      .from(s.messages)
      .where(eq(s.messages.conversationId, conv.id))
      .orderBy(desc(s.messages.seq))
      .limit(120)
  ).reverse();
  const mediaIds = [...new Set(msgs.flatMap((m) => (Array.isArray((m.metadata as { media?: unknown }).media) ? ((m.metadata as { media: string[] }).media) : [])))];
  const media = await getMediaByIds(app, mediaIds);
  const byId = new Map(media.map((m) => [m.id, m]));
  const [crm] = await app.db.select().from(s.crmStates).where(and(eq(s.crmStates.customerId, customerId), eq(s.crmStates.isCurrent, true)));
  const [profile] = await app.db.select({ data: s.customerProfiles.data }).from(s.customerProfiles).where(eq(s.customerProfiles.customerId, customerId));
  const tags = await app.db.select({ tag: s.customerTags.tag }).from(s.customerTags).where(and(eq(s.customerTags.customerId, customerId), isNull(s.customerTags.removedAt)));
  const appts = await app.db
    .select({ id: s.appointments.id, at: s.appointments.scheduledAt, kind: s.appointments.kind, status: s.appointments.status, window: s.appointments.requestedWindow })
    .from(s.appointments)
    .where(and(eq(s.appointments.customerId, customerId), inArray(s.appointments.status, ["scheduled", "confirmed"])))
    .orderBy(asc(s.appointments.scheduledAt))
    .limit(3);
  const p = (profile?.data ?? {}) as Record<string, unknown>;
  return {
    customer: { id: customer.id, name: cleanName(customer.displayName), phone: customer.phone, responseStatus: customer.responseStatus },
    conversation: { id: conv.id, controlMode: conv.controlMode },
    crm: { stage: crm?.stage ?? "new", temperature: crm?.temperature ?? "cold" },
    highlights: {
      model: typeof p.vehicle_interest === "string" ? p.vehicle_interest : null,
      version: typeof p.version === "string" ? p.version : null,
      downPayment: typeof p.down_payment === "number" ? p.down_payment : null,
      monthly: typeof p.target_monthly_payment === "number" ? p.target_monthly_payment : null,
      payment: typeof p.payment_method === "string" ? p.payment_method : null,
      timing: typeof p.purchase_timing === "string" ? p.purchase_timing : null,
    },
    tags: tags.map((t) => ({ tag: t.tag, label: tagLabel(t.tag), model: isModelTag(t.tag) })),
    appointments: appts,
    messages: msgs.map((m) => {
      const meta = m.metadata as { media?: string[]; delivered?: boolean; outboxId?: string; understood?: { burst: number; fixes: Array<{ from: string; to: string }> }; status?: string };
      return {
        id: m.id,
        sender: m.sender,
        body: m.body,
        at: m.createdAt,
        delivered: meta.delivered === true || Boolean(meta.outboxId),
        understood: meta.understood && (meta.understood.burst > 1 || meta.understood.fixes.length) ? { burst: meta.understood.burst, fixes: meta.understood.fixes } : null,
        media: (meta.media ?? []).map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x)).map((x) => ({ id: x.id, kind: x.kind, title: x.title, mimeType: x.mimeType })),
      };
    }),
  };
}
export type ChatView = Awaited<ReturnType<typeof getChat>>;

/**
 * Lo que Mario pegó. `as`: "auto" (detecta encabezados de WhatsApp), "customer" (todo lo dijo
 * el cliente) o "mario" (lo contestó Mario; Sofía no responde).
 */
export async function ingestPaste(
  app: AppContext,
  input: { customerId?: string | null; name?: string | null; phone?: string | null; text: string; as?: "auto" | "customer" | "mario" },
) {
  const text = input.text.trim();
  if (!text) throw new ServiceError("Pega o escribe el mensaje del cliente.");
  if (text.length > 12000) throw new ServiceError("Es demasiado texto; pega solo los mensajes nuevos.");

  let customerId = input.customerId ?? null;
  if (!customerId) {
    const phone = input.phone?.replace(/[^\d+]/g, "") || null;
    if (phone) {
      const digits = phone.replace(/\D/g, "").slice(-10);
      const [existing] = await app.db
        .select({ id: s.customers.id })
        .from(s.customers)
        .where(and(eq(s.customers.workspaceId, app.workspaceId), sql`right(regexp_replace(coalesce(${s.customers.phone}, ''), '[^0-9]', '', 'g'), 10) = ${digits}`))
        .limit(1);
      if (existing) customerId = existing.id;
    }
    if (!customerId) {
      const name = input.name?.trim() || (phone ? `Prospecto ${phone.slice(-4)}` : "Prospecto WhatsApp");
      const created = await createCustomer(app, { displayName: name, phone });
      customerId = created.customer.id;
      await app.db.update(s.customers).set({ source: "whatsapp" }).where(eq(s.customers.id, customerId));
      await app.db.update(s.conversations).set({ channel: "whatsapp" }).where(eq(s.conversations.id, created.conversation.id));
    }
  } else {
    const [c] = await app.db.select({ id: s.customers.id }).from(s.customers).where(and(eq(s.customers.id, customerId), eq(s.customers.workspaceId, app.workspaceId)));
    if (!c) throw new ServiceError("Cliente no encontrado.", 404);
  }

  const style = await loadStyle(app.db, app.workspaceId);
  const advisor = [style.advisorName, style.advisorName.split(" ")[0] ?? ""].filter(Boolean);
  let parsed = parsePastedChat(text, advisor);
  if (input.as === "customer") parsed = parsed.map((m) => ({ ...m, sender: "customer" as const }));
  if (input.as === "mario") parsed = parsed.map((m) => ({ ...m, sender: "mario" as const }));
  if (!parsed.length) throw new ServiceError("No encontré mensajes en lo que pegaste.");

  const conv = await conversationFor(app, customerId);
  let lastCustomerMessageId: string | null = null;
  let lastSender: "customer" | "mario" | null = null;
  for (const m of parsed.slice(-40)) {
    const [row] = await app.db
      .insert(s.messages)
      .values({ workspaceId: app.workspaceId, conversationId: conv.id, customerId, sender: m.sender, body: m.body.slice(0, 4000), metadata: { source: "whatsapp_paste", author: m.author, hasMedia: m.hasMedia } })
      .returning({ id: s.messages.id });
    if (m.sender === "customer") lastCustomerMessageId = row!.id;
    lastSender = m.sender;
  }
  await app.db.update(s.conversations).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(s.conversations.id, conv.id));
  await app.db
    .update(s.customers)
    .set({ responseStatus: lastSender === "customer" ? "waiting_mario" : "waiting_customer", lastContactAt: lastSender === "mario" ? new Date() : undefined, updatedAt: new Date() })
    .where(eq(s.customers.id, customerId));

  // Sofía contesta una sola vez a todo lo que el cliente mandó seguido (si el último en hablar fue el cliente).
  if (lastSender === "customer" && lastCustomerMessageId && conv.controlMode === "sofia") {
    const turn = await runSofiaTurn(app, { conversationId: conv.id, inboundMessageId: lastCustomerMessageId });
    return { customerId, conversationId: conv.id, replied: true, reply: turn.reply, replyMessageId: turn.replyMessageId, status: turn.status };
  }
  await syncCustomerBoard(app, customerId).catch(() => undefined);
  return { customerId, conversationId: conv.id, replied: false, reply: null, replyMessageId: null, status: conv.controlMode === "mario" ? "mario_control" : "logged" };
}

/** Sofía vuelve a contestar el último mensaje del cliente (p. ej. tras subir fotos o cambiar el estilo). */
export async function regenerateReply(app: AppContext, customerId: string) {
  const conv = await conversationFor(app, customerId);
  const [lastCustomer] = await app.db
    .select({ id: s.messages.id })
    .from(s.messages)
    .where(and(eq(s.messages.conversationId, conv.id), eq(s.messages.sender, "customer")))
    .orderBy(desc(s.messages.seq))
    .limit(1);
  if (!lastCustomer) throw new ServiceError("Todavía no hay mensajes del cliente.");
  const turn = await runSofiaTurn(app, { conversationId: conv.id, inboundMessageId: lastCustomer.id });
  return { reply: turn.reply, replyMessageId: turn.replyMessageId };
}

/** Mario ya mandó por WhatsApp la respuesta de Sofía. */
export async function markReplyDelivered(app: AppContext, messageId: string) {
  const [m] = await app.db.select().from(s.messages).where(and(eq(s.messages.id, messageId), eq(s.messages.workspaceId, app.workspaceId)));
  if (!m) throw new ServiceError("Mensaje no encontrado.", 404);
  await app.db.update(s.messages).set({ metadata: { ...m.metadata, delivered: true, deliveredAt: new Date().toISOString() } }).where(eq(s.messages.id, messageId));
  await app.db.update(s.customers).set({ responseStatus: "waiting_customer", lastContactAt: new Date(), updatedAt: new Date() }).where(eq(s.customers.id, m.customerId));
}

/** Mario escribe directo en el chat (lo que él contestó). Sofía no responde a eso. */
export async function logMarioMessage(app: AppContext, customerId: string, body: string) {
  return ingestPaste(app, { customerId, text: body, as: "mario" });
}
