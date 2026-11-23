/**
 * Cola de envíos de Sofía (sin API de WhatsApp).
 *
 *  indicación de Mario / seguimiento por cadencia / confirmación de cita
 *    → mensaje redactado por cliente (estilo de Mario + día) + material del modelo
 *    → Mario revisa → toca "Enviar" (se abre WhatsApp con texto y archivos)
 *    → queda registrado en la conversación del cliente.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { parseDirective, type DirectivePlan, type MediaKind } from "@/domain/directive";
import type { Temperature } from "@/domain/enums";
import { composeMessage, followupAttemptDue, mxParts, type ComposeKind, type SalesStyle } from "@/domain/sales-style";
import { isModelTag, tagLabel } from "@/domain/tags";
import type { AppContext } from "../app";
import { loadCatalog, toCatalogVehicles } from "../commercial/catalog";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { APPOINTMENT_KINDS } from "../services/agenda";
import { ServiceError } from "../services/errors";
import { getMediaByIds, listMedia, pickMedia, type MediaKindValue, type MediaLite } from "./media";
import { ensureColumns } from "./pipeline";
import { loadStyle } from "./style";

const CLOSED_STAGES = new Set(["sold", "not_interested"]);

export interface AudienceRow {
  id: string;
  name: string;
  firstName: string | null;
  phone: string | null;
  temperature: Temperature;
  stage: string;
  columnId: string | null;
  period: string | null;
  models: string[];
  conversationId: string | null;
  lastInAt: Date | null;
  lastOutAt: Date | null;
  nextAppointment: { id: string; at: Date; kind: string } | null;
}

const cleanName = (n: string) => n.replace(/\s*\(DEMO\)\s*/gi, " ").trim();
function firstNameOf(name: string): string | null {
  const n = cleanName(name);
  if (!n || /^prospecto\b/i.test(n) || /^\+?\d[\d\s-]+$/.test(n)) return null;
  return n.split(" ")[0] ?? null;
}

export async function loadAudience(app: AppContext): Promise<AudienceRow[]> {
  const now = app.clock.now();
  const [rows, cards, tags, profiles, lastMsgs, appts] = await Promise.all([
    app.db
      .select({ id: s.customers.id, name: s.customers.displayName, phone: s.customers.phone, temperature: s.crmStates.temperature, stage: s.crmStates.stage })
      .from(s.customers)
      .leftJoin(s.crmStates, and(eq(s.crmStates.customerId, s.customers.id), eq(s.crmStates.isCurrent, true)))
      .where(and(eq(s.customers.workspaceId, app.workspaceId), isNull(s.customers.archivedAt))),
    app.db.select().from(s.pipelineCards).where(eq(s.pipelineCards.workspaceId, app.workspaceId)),
    app.db.select({ customerId: s.customerTags.customerId, tag: s.customerTags.tag }).from(s.customerTags).where(and(eq(s.customerTags.workspaceId, app.workspaceId), isNull(s.customerTags.removedAt))),
    app.db.select({ customerId: s.customerProfiles.customerId, data: s.customerProfiles.data }).from(s.customerProfiles).where(eq(s.customerProfiles.workspaceId, app.workspaceId)),
    app.db
      .select({
        customerId: s.messages.customerId,
        conversationId: sql<string>`max(${s.messages.conversationId}::text)`,
        lastIn: sql<string | null>`max(${s.messages.createdAt}) filter (where ${s.messages.sender} = 'customer')`,
        lastOut: sql<string | null>`max(${s.messages.createdAt}) filter (where ${s.messages.sender} in ('sofia','mario'))`,
      })
      .from(s.messages)
      .where(eq(s.messages.workspaceId, app.workspaceId))
      .groupBy(s.messages.customerId),
    app.db
      .select({ id: s.appointments.id, customerId: s.appointments.customerId, at: s.appointments.scheduledAt, kind: s.appointments.kind })
      .from(s.appointments)
      .where(and(eq(s.appointments.workspaceId, app.workspaceId), inArray(s.appointments.status, ["scheduled", "confirmed"]), gte(s.appointments.scheduledAt, new Date(now.getTime() - 2 * 3600_000))))
      .orderBy(asc(s.appointments.scheduledAt)),
  ]);
  const convs = await app.db
    .select({ id: s.conversations.id, customerId: s.conversations.customerId })
    .from(s.conversations)
    .where(eq(s.conversations.workspaceId, app.workspaceId))
    .orderBy(desc(s.conversations.createdAt));
  const convMap = new Map<string, string>();
  for (const c of convs) if (!convMap.has(c.customerId)) convMap.set(c.customerId, c.id);
  const cardMap = new Map(cards.map((c) => [c.customerId, c]));
  const tagMap = new Map<string, string[]>();
  for (const t of tags) tagMap.set(t.customerId, [...(tagMap.get(t.customerId) ?? []), t.tag]);
  const profMap = new Map(profiles.map((p) => [p.customerId, p.data]));
  const msgMap = new Map(lastMsgs.map((m) => [m.customerId, m]));
  const apptMap = new Map<string, AudienceRow["nextAppointment"]>();
  for (const a of appts) if (a.at && !apptMap.has(a.customerId)) apptMap.set(a.customerId, { id: a.id, at: a.at, kind: a.kind });

  return rows.map((r) => {
    const interest = profMap.get(r.id)?.vehicle_interest;
    const models = Array.from(new Set([...(typeof interest === "string" ? [interest] : []), ...(tagMap.get(r.id) ?? []).filter(isModelTag).map(tagLabel)]));
    const m = msgMap.get(r.id);
    return {
      id: r.id,
      name: cleanName(r.name),
      firstName: firstNameOf(typeof profMap.get(r.id)?.name === "string" ? (profMap.get(r.id)!.name as string) : r.name),
      phone: r.phone,
      temperature: (r.temperature ?? "cold") as Temperature,
      stage: r.stage ?? "new",
      columnId: cardMap.get(r.id)?.columnId ?? null,
      period: cardMap.get(r.id)?.period ?? null,
      models,
      conversationId: convMap.get(r.id) ?? null,
      lastInAt: m?.lastIn ? new Date(m.lastIn) : null,
      lastOutAt: m?.lastOut ? new Date(m.lastOut) : null,
      nextAppointment: apptMap.get(r.id) ?? null,
    };
  });
}

function sameModel(a: string, b: string) {
  return a.toLowerCase().replace(/[\s-]/g, "") === b.toLowerCase().replace(/[\s-]/g, "");
}

/** Aplica el público de la indicación (filtros combinados con "y"; nombres siempre entran). */
export function filterAudience(rows: AudienceRow[], plan: DirectivePlan, now: Date): AudienceRow[] {
  const a = plan.audience;
  const named = new Set(a.customerIds);
  const hasFilters = a.temperatures.length || a.columnIds.length || a.models.length || a.period || a.noReplyDays || a.withAppointment;
  if (!hasFilters && !a.all) return rows.filter((r) => named.has(r.id));
  const p = mxParts(now);
  const filtered = rows.filter((r) => {
    if (named.has(r.id)) return true;
    if (CLOSED_STAGES.has(r.stage) && !a.customerIds.includes(r.id)) return false;
    const groupOk =
      !a.temperatures.length && !a.columnIds.length ? true : a.temperatures.includes(r.temperature) || (r.columnId !== null && a.columnIds.includes(r.columnId));
    if (!groupOk) return false;
    if (a.models.length && !r.models.some((m) => a.models.some((x) => sameModel(m, x)))) return false;
    if (a.period && r.period !== a.period) return false;
    if (a.noReplyDays) {
      if (!r.lastOutAt) return false;
      if (r.lastInAt && r.lastInAt > r.lastOutAt) return false;
      if ((now.getTime() - r.lastOutAt.getTime()) / 86_400_000 < a.noReplyDays) return false;
    }
    if (a.withAppointment) {
      if (!r.nextAppointment) return false;
      if (a.appointmentDay) {
        const ap = mxParts(r.nextAppointment.at);
        const target = a.appointmentDay === "today" ? p : mxParts(new Date(now.getTime() + 86_400_000));
        if (ap.day !== target.day || ap.month !== target.month) return false;
      }
    }
    return true;
  });
  return filtered;
}

export interface PreviewItem {
  customerId: string;
  name: string;
  phone: string | null;
  body: string;
  mediaIds: string[];
  model: string | null;
  kind: ComposeKind;
}

function mediaFor(library: MediaLite[], vehicleId: string | null, kinds: MediaKind[], now: Date, purpose: DirectivePlan["purpose"]): MediaLite[] {
  const want: MediaKindValue[] = kinds.length ? [...kinds] : purpose === "promo" ? ["flyer"] : [];
  if (!want.length) return [];
  const own = pickMedia(library, { vehicleId, kinds: want, now });
  if (own.length || vehicleId === null) return own;
  // Flyer general de la agencia si el modelo no tiene uno propio.
  return want.includes("flyer") ? pickMedia(library, { vehicleId: null, kinds: ["flyer"], now }) : [];
}

/** Interpreta la indicación y redacta un mensaje por cliente (todavía no se guarda nada). */
export async function previewDirective(app: AppContext, text: string, opts: { customerId?: string } = {}) {
  const clean = text.trim();
  if (!clean) throw new ServiceError("Escribe la indicación para Sofía.");
  if (clean.length > 1500) throw new ServiceError("La indicación es demasiado larga.");
  const now = app.clock.now();
  const [catalog, cols, audience, style, library] = await Promise.all([loadCatalog(app.db, app.workspaceId), ensureColumns(app), loadAudience(app), loadStyle(app.db, app.workspaceId), listMedia(app)]);
  const plan = parseDirective(clean, {
    columns: cols.map((c) => ({ id: c.id, name: c.name, temperature: c.temperature })),
    catalog: toCatalogVehicles(catalog),
    customers: audience.map((a) => ({ id: a.id, name: a.name })),
    now,
  });
  const updates = await app.db
    .select()
    .from(s.vehicleUpdates)
    .where(and(eq(s.vehicleUpdates.workspaceId, app.workspaceId), eq(s.vehicleUpdates.active, true)))
    .orderBy(desc(s.vehicleUpdates.createdAt));
  if (opts.customerId) {
    // Indicación desde el chat de un cliente: va solo para ese cliente.
    plan.audience = { ...plan.audience, customerIds: [opts.customerId], columnIds: [], temperatures: [], models: [], period: null, noReplyDays: null, withAppointment: false, appointmentDay: null, all: false };
    plan.warnings = plan.warnings.filter((w) => !w.startsWith("No entendí a quién"));
  }
  const recipients = filterAudience(audience, plan, now);
  const items: PreviewItem[] = recipients.slice(0, 200).map((r) => {
    const model = plan.model ?? r.models[0] ?? null;
    const vehicle = model ? catalog.vehicles.find((v) => sameModel(v.model, model)) : undefined;
    const note = vehicle ? updates.find((u) => u.vehicleId === vehicle.id && (!u.validTo || u.validTo >= now))?.text ?? null : null;
    const media = mediaFor(library, vehicle?.id ?? null, plan.media, now, plan.purpose);
    const kind: ComposeKind = plan.purpose === "appointment" ? "appointment" : "directive";
    const body = composeMessage({
      kind,
      style,
      now,
      firstName: r.firstName,
      model: vehicle?.model ?? model,
      custom: plan.message,
      note,
      purpose: plan.purpose,
      mediaKinds: media.map((m) => m.kind),
      appointment: r.nextAppointment ? { at: r.nextAppointment.at, kindLabel: APPOINTMENT_KINDS[r.nextAppointment.kind] ?? "Cita" } : null,
    });
    return { customerId: r.id, name: r.name, phone: r.phone, body, mediaIds: media.map((m) => m.id), model: vehicle?.model ?? model, kind };
  });
  const warnings = [...plan.warnings];
  if (recipients.length > 200) warnings.push(`Son ${recipients.length} clientes; preparo los primeros 200.`);
  if (!items.length && !plan.warnings.length) warnings.push("Ningún cliente cumple con eso. Revisa el tablero o escribe el nombre del cliente.");
  if (items.some((i) => !i.phone)) warnings.push("Algunos clientes no tienen teléfono: podrás copiar el mensaje, pero no abrir su WhatsApp.");
  if (plan.media.length && items.length && items.every((i) => !i.mediaIds.length)) warnings.push("No encontré ese material en la biblioteca del modelo; súbelo en Ventas → Modelos.");
  return { plan, items, warnings, style };
}

/** Guarda la indicación y deja los mensajes (ya revisados por Mario) en la cola. */
export async function commitDirective(app: AppContext, input: { text: string; plan: Record<string, unknown>; items: Array<{ customerId: string; body: string; mediaIds: string[]; kind?: string }>; dueAt?: string | null }) {
  if (!input.items.length) throw new ServiceError("No hay mensajes para guardar.");
  const ids = input.items.map((i) => i.customerId);
  const audience = await app.db
    .select({ id: s.customers.id })
    .from(s.customers)
    .where(and(eq(s.customers.workspaceId, app.workspaceId), inArray(s.customers.id, ids)));
  const valid = new Set(audience.map((a) => a.id));
  const convs = await app.db.select({ id: s.conversations.id, customerId: s.conversations.customerId }).from(s.conversations).where(inArray(s.conversations.customerId, ids));
  const convMap = new Map(convs.map((c) => [c.customerId, c.id]));
  const mediaOk = new Set((await getMediaByIds(app, [...new Set(input.items.flatMap((i) => i.mediaIds))])).map((m) => m.id));
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  return app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [directive] = await tx
      .insert(s.sofiaDirectives)
      .values({ workspaceId: app.workspaceId, text: input.text.slice(0, 1500), plan: input.plan, status: "queued", recipients: input.items.length })
      .returning();
    const rows = input.items
      .filter((i) => valid.has(i.customerId) && i.body.trim())
      .map((i) => ({
        workspaceId: app.workspaceId,
        customerId: i.customerId,
        conversationId: convMap.get(i.customerId) ?? null,
        directiveId: directive!.id,
        kind: i.kind === "appointment" ? "appointment" : "directive",
        body: i.body.trim().slice(0, 3000),
        mediaIds: i.mediaIds.filter((m) => mediaOk.has(m)).slice(0, 6),
        reason: `Indicación: ${input.text.slice(0, 160)}`,
        dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
      }));
    const created = rows.length ? await tx.insert(s.outboxMessages).values(rows).returning({ id: s.outboxMessages.id, customerId: s.outboxMessages.customerId }) : [];
    await tx.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "directive_queued", entityType: "sofia_directive", entityId: directive!.id, data: { recipients: rows.length } });
    return { directiveId: directive!.id, queued: created.length, ids: created };
  });
}

/** Seguimientos que tocan hoy según la cadencia de Mario (cliente no ha contestado). */
export async function suggestFollowups(app: AppContext) {
  const now = app.clock.now();
  const style = await loadStyle(app.db, app.workspaceId);
  if (style.restOnSunday && mxParts(now).weekday === 0) return { style, items: [] as PreviewItem[], restDay: true };
  const [audience, pending, sentFollowups, catalog, library] = await Promise.all([
    loadAudience(app),
    app.db.select({ customerId: s.outboxMessages.customerId }).from(s.outboxMessages).where(and(eq(s.outboxMessages.workspaceId, app.workspaceId), eq(s.outboxMessages.status, "pending"))),
    app.db
      .select({ customerId: s.outboxMessages.customerId, sentAt: s.outboxMessages.sentAt })
      .from(s.outboxMessages)
      .where(and(eq(s.outboxMessages.workspaceId, app.workspaceId), eq(s.outboxMessages.status, "sent"), eq(s.outboxMessages.kind, "followup"))),
    loadCatalog(app.db, app.workspaceId),
    listMedia(app),
  ]);
  const updates = await app.db.select().from(s.vehicleUpdates).where(and(eq(s.vehicleUpdates.workspaceId, app.workspaceId), eq(s.vehicleUpdates.active, true))).orderBy(desc(s.vehicleUpdates.createdAt));
  const pendingSet = new Set(pending.map((p) => p.customerId));
  const items: PreviewItem[] = [];
  for (const r of audience) {
    if (CLOSED_STAGES.has(r.stage) || pendingSet.has(r.id) || !r.lastOutAt) continue;
    if (r.lastInAt && r.lastInAt >= r.lastOutAt) continue; // el cliente habló al último: le toca a Sofía/Mario contestar, no dar seguimiento.
    const attempts = sentFollowups.filter((f) => f.customerId === r.id && f.sentAt && (!r.lastInAt || f.sentAt > r.lastInAt)).length;
    const days = (now.getTime() - r.lastOutAt.getTime()) / 86_400_000;
    const attempt = followupAttemptDue(days, attempts, style);
    if (!attempt) continue;
    const model = r.models[0] ?? null;
    const vehicle = model ? catalog.vehicles.find((v) => sameModel(v.model, model)) : undefined;
    const note = vehicle ? updates.find((u) => u.vehicleId === vehicle.id && (!u.validTo || u.validTo >= now))?.text ?? null : null;
    const media = attempt === 2 && vehicle ? pickMedia(library, { vehicleId: vehicle.id, kinds: ["photo"], now, onlyOnAsk: true, perKind: { photo: 2 } }) : [];
    items.push({
      customerId: r.id,
      name: r.name,
      phone: r.phone,
      model: vehicle?.model ?? model,
      kind: "followup",
      mediaIds: media.map((m) => m.id),
      body: composeMessage({ kind: "followup", style, now, firstName: r.firstName, model: vehicle?.model ?? model, attempt, note, mediaKinds: media.map((m) => m.kind) }),
    });
  }
  // Primero los más calientes.
  const rank: Record<Temperature, number> = { very_hot: 0, hot: 1, interested: 2, cold: 3 };
  const temp = new Map(audience.map((a) => [a.id, a.temperature]));
  items.sort((a, b) => rank[temp.get(a.customerId) ?? "cold"] - rank[temp.get(b.customerId) ?? "cold"]);
  return { style, items, restDay: false };
}

export async function queueFollowups(app: AppContext, items: Array<{ customerId: string; body: string; mediaIds: string[] }>, kind: "followup" | "appointment" = "followup") {
  if (!items.length) return { queued: 0 };
  const ids = items.map((i) => i.customerId);
  const valid = new Set((await app.db.select({ id: s.customers.id }).from(s.customers).where(and(eq(s.customers.workspaceId, app.workspaceId), inArray(s.customers.id, ids)))).map((c) => c.id));
  const convs = await app.db.select({ id: s.conversations.id, customerId: s.conversations.customerId }).from(s.conversations).where(inArray(s.conversations.customerId, ids));
  const convMap = new Map(convs.map((c) => [c.customerId, c.id]));
  const rows = items
    .filter((i) => valid.has(i.customerId) && i.body.trim())
    .map((i) => ({ workspaceId: app.workspaceId, customerId: i.customerId, conversationId: convMap.get(i.customerId) ?? null, kind, body: i.body.trim().slice(0, 3000), mediaIds: i.mediaIds.slice(0, 6), reason: kind === "appointment" ? "Confirmación de cita" : "Seguimiento por cadencia" }));
  if (rows.length) await app.db.insert(s.outboxMessages).values(rows);
  return { queued: rows.length };
}

/** Confirmaciones de cita para hoy y mañana que aún no están en la cola. */
export async function suggestAppointmentConfirmations(app: AppContext) {
  const now = app.clock.now();
  const style = await loadStyle(app.db, app.workspaceId);
  const until = new Date(now.getTime() + 36 * 3600_000);
  const appts = await app.db
    .select({ id: s.appointments.id, customerId: s.appointments.customerId, at: s.appointments.scheduledAt, kind: s.appointments.kind, status: s.appointments.status, name: s.customers.displayName, phone: s.customers.phone })
    .from(s.appointments)
    .innerJoin(s.customers, eq(s.customers.id, s.appointments.customerId))
    .where(and(eq(s.appointments.workspaceId, app.workspaceId), eq(s.appointments.status, "scheduled"), gte(s.appointments.scheduledAt, now), lte(s.appointments.scheduledAt, until)))
    .orderBy(asc(s.appointments.scheduledAt));
  const pending = await app.db
    .select({ customerId: s.outboxMessages.customerId })
    .from(s.outboxMessages)
    .where(and(eq(s.outboxMessages.workspaceId, app.workspaceId), eq(s.outboxMessages.status, "pending"), eq(s.outboxMessages.kind, "appointment")));
  const pendingSet = new Set(pending.map((p) => p.customerId));
  const profiles = await app.db.select({ customerId: s.customerProfiles.customerId, data: s.customerProfiles.data }).from(s.customerProfiles).where(eq(s.customerProfiles.workspaceId, app.workspaceId));
  const prof = new Map(profiles.map((p) => [p.customerId, p.data]));
  return appts
    .filter((a) => a.at && !pendingSet.has(a.customerId))
    .map<PreviewItem>((a) => {
      const model = typeof prof.get(a.customerId)?.vehicle_interest === "string" ? (prof.get(a.customerId)!.vehicle_interest as string) : null;
      return {
        customerId: a.customerId,
        name: cleanName(a.name),
        phone: a.phone,
        model,
        kind: "appointment",
        mediaIds: [],
        body: composeMessage({ kind: "appointment", style, now, firstName: firstNameOf(a.name), model, appointment: { at: a.at!, kindLabel: APPOINTMENT_KINDS[a.kind] ?? "Cita" } }),
      };
    });
}

export async function listOutbox(app: AppContext, opts: { status?: "pending" | "sent" | "skipped"; customerId?: string } = {}) {
  const rows = await app.db
    .select({ o: s.outboxMessages, name: s.customers.displayName, phone: s.customers.phone })
    .from(s.outboxMessages)
    .innerJoin(s.customers, eq(s.customers.id, s.outboxMessages.customerId))
    .where(
      and(
        eq(s.outboxMessages.workspaceId, app.workspaceId),
        eq(s.outboxMessages.status, opts.status ?? "pending"),
        opts.customerId ? eq(s.outboxMessages.customerId, opts.customerId) : undefined,
      ),
    )
    .orderBy(asc(sql`coalesce(${s.outboxMessages.dueAt}, ${s.outboxMessages.createdAt})`))
    .limit(300);
  const media = await getMediaByIds(app, [...new Set(rows.flatMap((r) => r.o.mediaIds))]);
  const byId = new Map(media.map((m) => [m.id, m]));
  return rows.map(({ o, name, phone }) => ({
    id: o.id,
    customerId: o.customerId,
    name: cleanName(name),
    phone,
    kind: o.kind,
    body: o.body,
    reason: o.reason,
    dueAt: o.dueAt,
    createdAt: o.createdAt,
    sentAt: o.sentAt,
    media: o.mediaIds.map((id) => byId.get(id)).filter((m): m is MediaLite => Boolean(m)).map((m) => ({ id: m.id, kind: m.kind, title: m.title, mimeType: m.mimeType })),
  }));
}
export type OutboxItem = Awaited<ReturnType<typeof listOutbox>>[number];

/** Mario mandó (o descartó) el mensaje. Al mandarlo queda en la conversación. */
export async function resolveOutbox(app: AppContext, id: string, action: "sent" | "skipped", body?: string) {
  const [o] = await app.db.select().from(s.outboxMessages).where(and(eq(s.outboxMessages.id, id), eq(s.outboxMessages.workspaceId, app.workspaceId)));
  if (!o) throw new ServiceError("Mensaje no encontrado.", 404);
  if (o.status !== "pending") return o;
  const finalBody = body?.trim() ? body.trim().slice(0, 3000) : o.body;
  return app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [updated] = await tx
      .update(s.outboxMessages)
      .set({ status: action, body: finalBody, sentAt: action === "sent" ? new Date() : null })
      .where(eq(s.outboxMessages.id, id))
      .returning();
    if (action === "sent") {
      let conversationId = o.conversationId;
      if (!conversationId) {
        const [conv] = await tx.select({ id: s.conversations.id }).from(s.conversations).where(eq(s.conversations.customerId, o.customerId)).limit(1);
        conversationId =
          conv?.id ??
          (await tx.insert(s.conversations).values({ workspaceId: app.workspaceId, customerId: o.customerId, channel: "whatsapp" }).returning({ id: s.conversations.id }))[0]!.id;
      }
      await tx.insert(s.messages).values({
        workspaceId: app.workspaceId,
        conversationId,
        customerId: o.customerId,
        sender: "sofia",
        body: finalBody,
        metadata: { outboxId: o.id, kind: o.kind, media: o.mediaIds, sentBy: "mario_whatsapp" },
      });
      await tx.update(s.conversations).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(s.conversations.id, conversationId));
      await tx.update(s.customers).set({ lastContactAt: new Date(), responseStatus: "waiting_customer", updatedAt: new Date() }).where(eq(s.customers.id, o.customerId));
    }
    return updated!;
  });
}

export async function editOutbox(app: AppContext, id: string, body: string) {
  const clean = body.trim();
  if (!clean) throw new ServiceError("El mensaje está vacío.");
  const [row] = await app.db
    .update(s.outboxMessages)
    .set({ body: clean.slice(0, 3000) })
    .where(and(eq(s.outboxMessages.id, id), eq(s.outboxMessages.workspaceId, app.workspaceId), eq(s.outboxMessages.status, "pending")))
    .returning();
  if (!row) throw new ServiceError("Mensaje no encontrado.", 404);
  return row;
}

/** Mensaje de material del modelo para un cliente (Mario: "mándale el video del HR-V"). */
export async function composeMediaMessage(app: AppContext, customerId: string, mediaIds: string[], custom: string | null) {
  const [style, media, audience] = await Promise.all([loadStyle(app.db, app.workspaceId), getMediaByIds(app, mediaIds), loadAudience(app)]);
  const r = audience.find((a) => a.id === customerId);
  if (!r) throw new ServiceError("Cliente no encontrado.", 404);
  const model = media.find((m) => m.model)?.model ?? r.models[0] ?? null;
  const caption = media.find((m) => m.caption)?.caption ?? null;
  return composeMessage({ kind: "media", style, now: app.clock.now(), firstName: r.firstName, model, custom: custom ?? caption, mediaKinds: media.map((m) => m.kind) });
}

export type { SalesStyle };
