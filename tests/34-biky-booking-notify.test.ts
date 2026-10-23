import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ConfirmedBookingSchema, marioBookingSummary } from "@/server/biky/booking-contract";
import { acceptConfirmedBooking } from "@/server/biky/booking-service";
import { notifyMarioOfBooking } from "@/server/biky/mario-notify";
import * as s from "@/server/db/schema";
import { makeApp, type TestApp } from "./helpers";

const booking = {
  booking_id: "biky-calendar-confirmed-8855", status: "confirmed" as const,
  customer_name: "Roberto Díaz", customer_phone: "8112345678",
  model: "CR-V", starts_at: "2026-09-28T17:00:00-06:00",
  advisor: "Mario Abarca" as const, location: "Honda Valle Oriente" as const,
  kind: "test_drive" as const,
};

describe("BIKY confirmado → Sofía → Mario por WhatsApp", () => {
  let app: TestApp;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });

  it("rechaza propuestas de cita, datos incompletos y eventos no confirmados", () => {
    expect(ConfirmedBookingSchema.safeParse({ ...booking, status: "proposed" }).success).toBe(false);
    expect(ConfirmedBookingSchema.safeParse({ ...booking, booking_id: "" }).success).toBe(false);
    expect(ConfirmedBookingSchema.safeParse(booking).success).toBe(true);
  });

  it("genera aviso para Mario con fecha y modelo correctos", () => {
    const text = marioBookingSummary(booking).text;
    expect(text).toContain("Hola papi");
    expect(text).toContain("Roberto Díaz");
    expect(text).toContain("CR-V");
    expect(text).toContain("5:00");
  });

  it("registra reserva confirmada una vez y avisa una sola vez", async () => {
    let notifications = 0;
    const fake = async () => { notifications++; return { channel: "biky_flow" as const, providerId: "accepted" }; };
    const first = await acceptConfirmedBooking(app, booking, fake);
    const second = await acceptConfirmedBooking(app, booking, fake);
    expect(first.notified).toBe(true);
    expect(second.appointmentId).toBe(first.appointmentId);
    expect(notifications).toBe(1);
    const [appointment] = await app.db.select().from(s.appointments).where(eq(s.appointments.id, first.appointmentId));
    expect(appointment?.status).toBe("confirmed");
    expect(appointment?.scheduledAt?.toISOString()).toBe("2026-09-28T23:00:00.000Z");
    const rows = await app.db.select().from(s.bikyBookingReceipts).where(and(
      eq(s.bikyBookingReceipts.workspaceId, app.workspaceId),
      eq(s.bikyBookingReceipts.externalBookingId, booking.booking_id),
    ));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.notificationChannel).toBe("biky_flow");
  });

  it("si falla el envío, conserva cita y permite reintentar sin duplicados", async () => {
    const retryBooking = { ...booking, booking_id: "biky-calendar-confirmed-8856", customer_name: "Ana López" };
    await expect(acceptConfirmedBooking(app, retryBooking, async () => { throw new Error("Sin canal"); }))
      .rejects.toThrow("Sin canal");
    let total = 0;
    const recovered = await acceptConfirmedBooking(app, retryBooking, async () => {
      total++; return { channel: "biky_flow" as const, providerId: "queued" };
    });
    expect(recovered.notified).toBe(true);
    expect(total).toBe(1);
    const [stored] = await app.db.select().from(s.bikyBookingReceipts).where(eq(s.bikyBookingReceipts.externalBookingId, retryBooking.booking_id));
    expect(stored?.appointmentId).toBe(recovered.appointmentId);
  });

  it("envía plantilla de Meta con variables y nunca texto libre como primer contacto", async () => {
    let outgoing: Record<string, unknown> = {};
    const stub = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      outgoing = JSON.parse(String(init?.body)); return Response.json({ messages: [{ id: "wamid.template-ok" }] });
    };
    const result = await notifyMarioOfBooking(booking, {
      WHATSAPP_PHONE_NUMBER_ID: "111", WHATSAPP_ACCESS_TOKEN: "testing",
      SOFIA_MARIO_WHATSAPP_TO: "528112345678", SOFIA_MARIO_TEMPLATE: "mario_cita_confirmada",
      WHATSAPP_GRAPH_VERSION: "v26.0",
    } as NodeJS.ProcessEnv, stub as typeof fetch);
    expect(result.channel).toBe("meta_template");
    expect(outgoing.type).toBe("template");
    expect((outgoing.template as { name: string }).name).toBe("mario_cita_confirmada");
  });
});
