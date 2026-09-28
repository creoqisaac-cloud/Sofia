/**
 * Seguimiento y citas (pedido directo de Mario). Todo cambio queda en auditoría.
 * No se envían mensajes externos: "Contactar" abre el teléfono de Mario y aquí solo se registra.
 */
import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import type { AppContext } from "../app";
import * as s from "../db/schema";
import { DAY_MS } from "../lib/clock";
import { ServiceError } from "./errors";

export const APPOINTMENT_STATUSES = ["scheduled", "confirmed", "completed", "cancelled", "no_show"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  completed: "Realizada",
  cancelled: "Cancelada",
  no_show: "No asistió",
};
export const APPOINTMENT_KINDS: Record<string, string> = { visit: "Visita", test_drive: "Prueba de manejo", delivery: "Entrega", call: "Llamada", signature: "Firma", other: "Cita" };

export const RESPONSE_STATUS_LABELS: Record<string, string> = { none: "—", waiting_customer: "Esperando respuesta del cliente", waiting_mario: "El cliente espera a Mario" };

/** Interfaz para un calendario externo futuro (Google/iCloud). Hoy no hay proveedor. */
export interface CalendarProvider {
  readonly configured: boolean;
  upsertEvent(input: { id: string; title: string; start: Date; location?: string | null; notes?: string | null }): Promise<void>;
}
export const noCalendar: CalendarProvider = { configured: false, async upsertEvent() {} };

async function assertCustomer(app: AppContext, customerId: string) {
  const [c] = await app.db.select().from(s.customers).where(and(eq(s.customers.id, customerId), eq(s.customers.workspaceId, app.workspaceId)));
  if (!c) throw new ServiceError("Cliente no encontrado.", 404);
  return c;
}

async function audit(app: AppContext, customerId: string, eventType: string, entityType: string, entityId: string, data: Record<string, unknown> = {}) {
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType, entityType, entityId, customerId, data });
}

// ───────── seguimiento ─────────

export async function createFollowup(app: AppContext, input: { customerId: string; dueAt: Date; reason: string; action?: string | null; promisedByMario?: boolean }) {
  await assertCustomer(app, input.customerId);
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("Falta el motivo del seguimiento.");
  const [f] = await app.db
    .insert(s.followups)
    .values({ workspaceId: app.workspaceId, customerId: input.customerId, dueAt: input.dueAt, reason, action: input.action ?? null, promisedByMario: input.promisedByMario ?? false, createdBy: "mario" })
    .returning();
  await audit(app, input.customerId, "followup_created", "followup", f!.id, { dueAt: input.dueAt.toISOString() });
  return f!;
}

async function getFollowup(app: AppContext, id: string) {
  const [f] = await app.db.select().from(s.followups).where(and(eq(s.followups.id, id), eq(s.followups.workspaceId, app.workspaceId)));
  if (!f) throw new ServiceError("Seguimiento no encontrado.", 404);
  return f;
}

export async function completeFollowup(app: AppContext, id: string) {
  const f = await getFollowup(app, id);
  await app.db.update(s.followups).set({ status: "done", completedAt: app.clock.now() }).where(eq(s.followups.id, id));
  await audit(app, f.customerId, "followup_done", "followup", id);
}

export async function postponeFollowup(app: AppContext, id: string, days = 1) {
  const f = await getFollowup(app, id);
  const base = Math.max(app.clock.now().getTime(), f.dueAt?.getTime() ?? 0);
  const dueAt = new Date(base + days * DAY_MS);
  await app.db.update(s.followups).set({ dueAt }).where(eq(s.followups.id, id));
  await audit(app, f.customerId, "followup_postponed", "followup", id, { days });
  return dueAt;
}

/** Mario contactó al cliente (llamada/visita/mensaje desde su teléfono). */
export async function markContacted(app: AppContext, customerId: string, opts: { followupId?: string | null; waitingCustomer?: boolean } = {}) {
  await assertCustomer(app, customerId);
  const now = app.clock.now();
  await app.db.update(s.customers).set({ lastContactAt: now, responseStatus: opts.waitingCustomer === false ? "none" : "waiting_customer", updatedAt: now }).where(eq(s.customers.id, customerId));
  if (opts.followupId) await app.db.update(s.followups).set({ status: "done", completedAt: now }).where(and(eq(s.followups.id, opts.followupId), eq(s.followups.customerId, customerId)));
  await audit(app, customerId, "customer_contacted", "customer", customerId);
}

export async function setResponseStatus(app: AppContext, customerId: string, status: "none" | "waiting_customer" | "waiting_mario") {
  await assertCustomer(app, customerId);
  await app.db.update(s.customers).set({ responseStatus: status, updatedAt: app.clock.now() }).where(eq(s.customers.id, customerId));
  await audit(app, customerId, "response_status_changed", "customer", customerId, { status });
}

export async function listPendingFollowups(app: AppContext, opts: { customerId?: string; until?: Date } = {}) {
  const conds = [eq(s.followups.workspaceId, app.workspaceId), eq(s.followups.status, "pending")];
  if (opts.customerId) conds.push(eq(s.followups.customerId, opts.customerId));
  if (opts.until) conds.push(lt(s.followups.dueAt, opts.until));
  return app.db
    .select({ followup: s.followups, customerName: s.customers.displayName })
    .from(s.followups)
    .innerJoin(s.customers, eq(s.customers.id, s.followups.customerId))
    .where(and(...conds))
    .orderBy(asc(s.followups.dueAt));
}

/** Resumen de seguimiento de un cliente: último contacto, siguiente acción, promesa, estado de respuesta. */
export async function getFollowupSummary(app: AppContext, customerId: string) {
  const c = await assertCustomer(app, customerId);
  const [lastMsg] = await app.db
    .select({ at: s.messages.createdAt })
    .from(s.messages)
    .innerJoin(s.conversations, eq(s.conversations.id, s.messages.conversationId))
    .where(eq(s.conversations.customerId, customerId))
    .orderBy(desc(s.messages.createdAt))
    .limit(1);
  const pending = await listPendingFollowups(app, { customerId });
  const lastContact = [c.lastContactAt, lastMsg?.at ?? null].filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const next = pending[0]?.followup ?? null;
  return {
    lastContactAt: lastContact,
    responseStatus: c.responseStatus,
    next,
    promise: pending.find((p) => p.followup.promisedByMario)?.followup ?? null,
    pendingCount: pending.length,
  };
}

// ───────── citas ─────────

export async function scheduleAppointment(app: AppContext, input: { customerId: string; at: Date; kind?: string; location?: string | null; notes?: string | null }) {
  await assertCustomer(app, input.customerId);
  if (Number.isNaN(input.at.getTime())) throw new ServiceError("Fecha u hora inválida.");
  const [a] = await app.db
    .insert(s.appointments)
    .values({ workspaceId: app.workspaceId, customerId: input.customerId, kind: input.kind ?? "visit", scheduledAt: input.at, status: "scheduled", location: input.location ?? null, notes: input.notes ?? null, createdBy: "mario" })
    .returning();
  await audit(app, input.customerId, "appointment_scheduled", "appointment", a!.id, { at: input.at.toISOString(), kind: a!.kind });
  await noCalendar.upsertEvent({ id: a!.id, title: "Cita", start: input.at, location: a!.location, notes: null });
  return a!;
}

export async function setAppointmentStatus(app: AppContext, id: string, status: AppointmentStatus) {
  if (!APPOINTMENT_STATUSES.includes(status)) throw new ServiceError("Estado inválido.");
  const [a] = await app.db.select().from(s.appointments).where(and(eq(s.appointments.id, id), eq(s.appointments.workspaceId, app.workspaceId)));
  if (!a) throw new ServiceError("Cita no encontrada.", 404);
  await app.db.update(s.appointments).set({ status, updatedAt: app.clock.now() }).where(eq(s.appointments.id, id));
  await audit(app, a.customerId, "appointment_status", "appointment", id, { from: a.status, to: status });
}

export async function listAppointments(app: AppContext, opts: { from?: Date; to?: Date; customerId?: string; activeOnly?: boolean } = {}) {
  const conds = [eq(s.appointments.workspaceId, app.workspaceId)];
  if (opts.from) conds.push(gte(s.appointments.scheduledAt, opts.from));
  if (opts.to) conds.push(lt(s.appointments.scheduledAt, opts.to));
  if (opts.customerId) conds.push(eq(s.appointments.customerId, opts.customerId));
  if (opts.activeOnly) conds.push(inArray(s.appointments.status, ["scheduled", "confirmed"]));
  return app.db
    .select({ appointment: s.appointments, customerName: s.customers.displayName })
    .from(s.appointments)
    .innerJoin(s.customers, eq(s.customers.id, s.appointments.customerId))
    .where(and(...conds))
    .orderBy(asc(s.appointments.scheduledAt));
}
