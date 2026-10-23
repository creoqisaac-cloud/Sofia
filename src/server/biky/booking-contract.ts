import { z } from "zod";

/**
 * Contrato propio de Sofía para eventos transformados desde BIKY Flows.
 * NO presupone la existencia de una API pública de reservas de BIKY.
 * El admin mapea los campos disponibles desde el nodo HTTP de Flows.
 */
export const ConfirmedBookingSchema = z.object({
  booking_id: z.string().min(4).max(200),
  status: z.literal("confirmed"),
  customer_name: z.string().trim().min(2).max(120),
  customer_phone: z.string().min(10).max(24),
  model: z.string().trim().min(2).max(80),
  starts_at: z.iso.datetime({ offset: true }),
  advisor: z.literal("Mario Abarca"),
  location: z.literal("Honda Valle Oriente"),
  kind: z.enum(["visit","test_drive"]).default("visit"),
}).strict();
export type ConfirmedBooking = z.infer<typeof ConfirmedBookingSchema>;

const zone = "America/Monterrey";
export function marioBookingSummary(booking: ConfirmedBooking) {
  const at = new Date(booking.starts_at);
  const date = new Intl.DateTimeFormat("es-MX", {
    timeZone: zone, weekday: "long", day: "numeric", month: "long",
  }).format(at);
  const time = new Intl.DateTimeFormat("es-MX", {
    timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(at);
  const type = booking.kind === "test_drive" ? "prueba de manejo" : "visita";
  return {
    date, time, type,
    text: `Hola papi 👋 Ya tenemos cita confirmada. ${booking.customer_name} viene el ${date} a las ${time} para ${type} de la Honda ${booking.model} en Honda Valle Oriente. Contacto: ${booking.customer_phone}.`,
  };
}
