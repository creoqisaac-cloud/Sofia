/**
 * Recordatorios y alarmas para la tablet.
 *
 * El servidor calcula QUÉ avisar y CUÁNDO (seguimientos, citas y recordatorios libres); la APK los
 * programa como notificaciones locales de Android (AlarmManager), así suenan aunque la app esté
 * cerrada o sin internet. No se manda nada a terceros.
 */
import { and, asc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import type { AppContext } from "../app";
import * as s from "../db/schema";
import { DAY_MS } from "../lib/clock";
import { APPOINTMENT_KINDS } from "./agenda";
import { ServiceError } from "./errors";

export interface DeviceReminder {
  /** Clave estable (para no duplicar al re-sincronizar). */
  key: string;
  /** Id de notificación de Android (entero de 31 bits, estable por clave). */
  notificationId: number;
  title: string;
  body: string;
  at: string;
  url: string;
  alarm: boolean;
  source: "followup" | "appointment" | "reminder";
  sourceId: string;
  customerName: string | null;
}

const HORIZON_DAYS = 14;
const MAX_REMINDERS = 60;
const short = (n: string) => n.replace(/\s*\(DEMO\)\s*/, "");

/** FNV-1a de 31 bits, nunca 0. */
export function notificationIdFor(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h & 0x7fffffff) || 1;
}

export async function createReminder(app: AppContext, input: { at: Date; text: string; alarm?: boolean; customerId?: string | null }) {
  const text = input.text.trim().slice(0, 200);
  if (!text) throw new ServiceError("Escribe qué te recuerdo.");
  if (Number.isNaN(input.at.getTime())) throw new ServiceError("Fecha u hora inválida.");
  if (input.at.getTime() < app.clock.now().getTime() - 60_000) throw new ServiceError("La hora ya pasó.");
  if (input.customerId) {
    const [c] = await app.db.select().from(s.customers).where(and(eq(s.customers.id, input.customerId), eq(s.customers.workspaceId, app.workspaceId)));
    if (!c) throw new ServiceError("Cliente no encontrado.", 404);
  }
  const [r] = await app.db
    .insert(s.reminders)
    .values({ workspaceId: app.workspaceId, customerId: input.customerId ?? null, remindAt: input.at, text, alarm: Boolean(input.alarm), createdBy: "mario" })
    .returning();
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "reminder_created", entityType: "reminder", entityId: r!.id, customerId: input.customerId ?? null, data: { at: input.at.toISOString(), alarm: Boolean(input.alarm) } });
  return r!;
}

export async function setReminderStatus(app: AppContext, id: string, status: "done" | "cancelled") {
  const [r] = await app.db.select().from(s.reminders).where(and(eq(s.reminders.id, id), eq(s.reminders.workspaceId, app.workspaceId)));
  if (!r) throw new ServiceError("Recordatorio no encontrado.", 404);
  await app.db.update(s.reminders).set({ status }).where(eq(s.reminders.id, id));
}

/** Avisos de los próximos días, ordenados por hora. Solo a futuro: lo vencido vive en Seguimiento. */
export async function upcomingDeviceReminders(app: AppContext, opts: { days?: number } = {}): Promise<DeviceReminder[]> {
  const now = app.clock.now();
  const until = new Date(now.getTime() + (opts.days ?? HORIZON_DAYS) * DAY_MS);
  const out: DeviceReminder[] = [];
  const push = (r: Omit<DeviceReminder, "notificationId">) => {
    if (new Date(r.at).getTime() > now.getTime()) out.push({ ...r, notificationId: notificationIdFor(r.key) });
  };

  const followups = await app.db
    .select({ f: s.followups, name: s.customers.displayName })
    .from(s.followups)
    .innerJoin(s.customers, eq(s.customers.id, s.followups.customerId))
    .where(and(eq(s.followups.workspaceId, app.workspaceId), eq(s.followups.status, "pending"), isNotNull(s.followups.dueAt), gte(s.followups.dueAt, now), lt(s.followups.dueAt, until)))
    .orderBy(asc(s.followups.dueAt));
  for (const { f, name } of followups) {
    push({
      key: `followup:${f.id}:${f.dueAt!.toISOString()}`,
      title: `Seguimiento · ${short(name)}`,
      body: f.action ? `${f.action} — ${f.reason}` : f.reason,
      at: f.dueAt!.toISOString(),
      url: `/customers/${f.customerId}`,
      alarm: f.promisedByMario,
      source: "followup",
      sourceId: f.id,
      customerName: short(name),
    });
  }

  const appts = await app.db
    .select({ a: s.appointments, name: s.customers.displayName })
    .from(s.appointments)
    .innerJoin(s.customers, eq(s.customers.id, s.appointments.customerId))
    .where(and(eq(s.appointments.workspaceId, app.workspaceId), inArray(s.appointments.status, ["scheduled", "confirmed"]), isNotNull(s.appointments.scheduledAt), gte(s.appointments.scheduledAt, now), lt(s.appointments.scheduledAt, new Date(until.getTime() + 2 * 3_600_000))))
    .orderBy(asc(s.appointments.scheduledAt));
  for (const { a, name } of appts) {
    const at = a.scheduledAt!;
    const kind = APPOINTMENT_KINDS[a.kind] ?? "Cita";
    const hhmm = at.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });
    const where = a.location ? ` · ${a.location}` : "";
    push({ key: `appt:${a.id}:${at.toISOString()}:60`, title: `En 1 hora: ${kind} con ${short(name)}`, body: `${hhmm}${where}`, at: new Date(at.getTime() - 60 * 60_000).toISOString(), url: `/customers/${a.customerId}`, alarm: false, source: "appointment", sourceId: a.id, customerName: short(name) });
    push({ key: `appt:${a.id}:${at.toISOString()}:15`, title: `En 15 min: ${kind} con ${short(name)}`, body: `${hhmm}${where}`, at: new Date(at.getTime() - 15 * 60_000).toISOString(), url: `/customers/${a.customerId}`, alarm: true, source: "appointment", sourceId: a.id, customerName: short(name) });
  }

  const free = await app.db
    .select({ r: s.reminders, name: s.customers.displayName })
    .from(s.reminders)
    .leftJoin(s.customers, eq(s.customers.id, s.reminders.customerId))
    .where(and(eq(s.reminders.workspaceId, app.workspaceId), eq(s.reminders.status, "pending"), gte(s.reminders.remindAt, now), lt(s.reminders.remindAt, until)))
    .orderBy(asc(s.reminders.remindAt));
  for (const { r, name } of free) {
    push({
      key: `reminder:${r.id}:${r.remindAt.toISOString()}`,
      title: r.alarm ? `⏰ ${r.text}` : r.text,
      body: name ? `Cliente: ${short(name)}` : "Recordatorio de Sofía",
      at: r.remindAt.toISOString(),
      url: r.customerId ? `/customers/${r.customerId}` : "/followups",
      alarm: r.alarm,
      source: "reminder",
      sourceId: r.id,
      customerName: name ? short(name) : null,
    });
  }

  return out.sort((x, y) => x.at.localeCompare(y.at)).slice(0, MAX_REMINDERS);
}
