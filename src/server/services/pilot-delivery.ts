/**
 * Piloto para Mario: alta de prospecto + solicitud concreta de visita.
 * La hora queda AGENDADA y requiere confirmación humana; no pretende ser una
 * reserva en el calendario de BIKY ni confirma disponibilidad externa.
 */
import { and, eq, gte, inArray, lt, asc } from "drizzle-orm";
import type { AppContext } from "@/server/app";
import * as s from "@/server/db/schema";
import { createCustomer } from "@/server/services/customers";
import { scheduleAppointment } from "@/server/services/agenda";
import { ServiceError } from "@/server/services/errors";

const MX_ZONE = "America/Monterrey";
const KINDS = ["visit", "test_drive"] as const;
export const HONDA_MODELS = ["City", "Civic", "Accord", "HR-V", "CR-V", "BR-V", "Odyssey", "Pilot", "Otro"] as const;
export type PilotKind = typeof KINDS[number];

export function normalizePilotPhone(raw: string): string {
  const n = raw.replace(/\D/g, "");
  if (/^\d{10}$/.test(n)) return `52${n}`;
  if (/^521\d{10}$/.test(n)) return `52${n.slice(3)}`;
  if (/^52\d{10}$/.test(n)) return n;
  throw new ServiceError("Escribe un celular de México válido, con sus 10 dígitos.");
}

export function parsePilotDate(date: string, time: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new ServiceError("Elige fecha y hora válidas.");
  }
  const [year, month, day] = date.split("-").map(Number);
  const test = new Date(Date.UTC(year!, month! - 1, day!));
  if (test.getUTCFullYear() !== year || test.getUTCMonth() !== month! - 1 || test.getUTCDate() !== day) {
    throw new ServiceError("La fecha no existe.");
  }
  // En Nuevo León la hora civil está en UTC-06:00 desde 2023.
  const at = new Date(`${date}T${time}:00-06:00`);
  if (Number.isNaN(at.getTime())) throw new ServiceError("Fecha inválida.");
  return at;
}

export function pilotConfirmationText(input: {
  name: string; model: string; kind: PilotKind; at: Date; confirmed: boolean;
}): string {
  const first = input.name.trim().split(/\s+/)[0] ?? "cliente";
  const when = new Intl.DateTimeFormat("es-MX", {
    timeZone: MX_ZONE, weekday: "long", day: "numeric", month: "long",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(input.at);
  const kind = input.kind === "test_drive" ? "tu prueba de manejo" : "tu visita";
  return input.confirmed
    ? `Hola ${first}, soy Mario de Honda Valle Oriente. Te confirmo ${kind} para el ${when} para revisar la Honda ${input.model}. ¡Aquí te espero! Ubicación: https://maps.app.goo.gl/dN8J4bXSwbiFPyvU9?g_st=ic`
    : `Hola ${first}, soy Mario de Honda Valle Oriente. Ya tengo anotada tu solicitud para ${kind} de la Honda ${input.model} el ${when}. ¿Me confirmas si te queda bien? Con tu respuesta dejamos la cita confirmada.`;
}

export async function registerPilotVisit(app: AppContext, input: {
  name: string; phone: string; model: string; date: string; time: string; kind: PilotKind;
}): Promise<{ appointmentId: string; customerId: string; phone: string }> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100) throw new ServiceError("Escribe el nombre del cliente (2 a 100 letras).");
  if (!(HONDA_MODELS as readonly string[]).includes(input.model)) throw new ServiceError("Selecciona un modelo Honda.");
  if (!KINDS.includes(input.kind)) throw new ServiceError("Tipo de cita inválido.");
  const phone = normalizePilotPhone(input.phone);
  const at = parsePilotDate(input.date, input.time);
  if (at.getTime() < app.clock.now().getTime() + 5 * 60_000) throw new ServiceError("Elige un horario futuro.");
  if (at.getTime() > app.clock.now().getTime() + 90 * 86_400_000) throw new ServiceError("La fecha debe estar dentro de los próximos 90 días.");
  const candidates = [phone, phone.slice(2), `+${phone}`];
  const lookup = () => app.db.select().from(s.customers).where(and(
    eq(s.customers.workspaceId, app.workspaceId), inArray(s.customers.phone, candidates)
  )).limit(1);
  let [customer] = await lookup();
  if (!customer) {
    try {
      const created = await createCustomer(app, { displayName: name, phone });
      customer = created.customer;
      await app.db.update(s.customers).set({ source: "manual", updatedAt: app.clock.now() }).where(eq(s.customers.id, customer.id));
    } catch (error) {
      [customer] = await lookup();
      if (!customer) throw error;
    }
  }
  // Hora propuesta, sin inventar disponibilidad de BIKY. La agenda interna de
  // Mario evita colisiones con otra cita a menos de 45 minutos.
  const nearby = await app.db.select().from(s.appointments).where(and(
    eq(s.appointments.workspaceId, app.workspaceId),
    inArray(s.appointments.status, ["scheduled", "confirmed"]),
    gte(s.appointments.scheduledAt, new Date(at.getTime() - 44 * 60_000)),
    lt(s.appointments.scheduledAt, new Date(at.getTime() + 45 * 60_000)),
  )).orderBy(asc(s.appointments.scheduledAt));
  const identical = nearby.find(a => a.customerId === customer!.id && a.scheduledAt?.getTime() === at.getTime() && a.kind === input.kind);
  if (identical) return { appointmentId: identical.id, customerId: customer.id, phone };
  if (nearby.length) throw new ServiceError("Mario ya tiene una cita cerca de ese horario. Elige otra hora o revisa la agenda.");
  const appointment = await scheduleAppointment(app, {
    customerId: customer.id, at, kind: input.kind,
    location: "Honda Valle Oriente",
    notes: `Modelo de interés: Honda ${input.model}. Solicitada por WhatsApp. Pendiente de confirmación del cliente y disponibilidad de agencia.`,
  });
  return { appointmentId: appointment.id, customerId: customer.id, phone };
}
