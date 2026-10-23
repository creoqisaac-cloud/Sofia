import { and, eq, inArray, lt, or } from "drizzle-orm";
import type { AppContext } from "@/server/app";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { createCustomer } from "@/server/services/customers";
import { normalizePilotPhone } from "@/server/services/pilot-delivery";
import { logger } from "@/server/lib/logger";
import type { ConfirmedBooking } from "./booking-contract";
import { notifyMarioOfBooking, type MarioNotifyReceipt } from "./mario-notify";

export type BookingReceipt = { bookingId: string; appointmentId: string; state: string; notified: boolean };
export type NotifyFunction = (booking: ConfirmedBooking) => Promise<MarioNotifyReceipt>;

/**
 * The booking must already exist AND be confirmed by the authorized BIKY
 * scheduling source. Sofía never pretends an AI request is a reservation.
 */
export async function acceptConfirmedBooking(
  app: AppContext, booking: ConfirmedBooking,
  notifier: NotifyFunction = notifyMarioOfBooking,
): Promise<BookingReceipt> {
  const now = app.clock.now();
  const at = new Date(booking.starts_at);
  if (Number.isNaN(at.getTime()) || at.getTime() < now.getTime() - 60 * 60_000 ||
    at.getTime() > now.getTime() + 365 * 86_400_000) {
    throw new Error("La cita confirmada debe tener una fecha válida y reciente.");
  }
  const phone = normalizePilotPhone(booking.customer_phone);
  const candidates = [phone, phone.slice(2), `+${phone}`];
  let [customer] = await app.db.select().from(s.customers).where(and(
    eq(s.customers.workspaceId, app.workspaceId), inArray(s.customers.phone, candidates),
  )).limit(1);
  if (!customer) {
    try {
      const created = await createCustomer(app, { displayName: booking.customer_name, phone });
      customer = created.customer;
      await app.db.update(s.customers).set({ source: "biky", updatedAt: now }).where(eq(s.customers.id, customer.id));
    } catch (error) {
      [customer] = await app.db.select().from(s.customers).where(and(
        eq(s.customers.workspaceId, app.workspaceId), inArray(s.customers.phone, candidates),
      )).limit(1);
      if (!customer) throw error;
    }
  }

  // One transaction creates the external receipt AND local confirmed appointment.
  const receipt = await app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [newReceipt] = await tx.insert(s.bikyBookingReceipts).values({
      workspaceId: app.workspaceId, externalBookingId: booking.booking_id, notificationState: "pending",
    }).onConflictDoNothing().returning();
    if (!newReceipt) {
      const [existing] = await tx.select().from(s.bikyBookingReceipts).where(and(
        eq(s.bikyBookingReceipts.workspaceId, app.workspaceId),
        eq(s.bikyBookingReceipts.externalBookingId, booking.booking_id),
      )).limit(1);
      if (!existing?.appointmentId) throw new Error("La reserva está siendo procesada. Reintenta.");
      return existing;
    }
    const [appt] = await tx.insert(s.appointments).values({
      workspaceId: app.workspaceId,
      customerId: customer!.id,
      kind: booking.kind,
      scheduledAt: at,
      status: "confirmed",
      location: booking.location,
      notes: `Reserva BIKY confirmada. Honda ${booking.model}. ID externo: ${booking.booking_id}.`,
      createdBy: "system",
    }).returning({ id: s.appointments.id });
    const [updated] = await tx.update(s.bikyBookingReceipts)
      .set({ appointmentId: appt!.id, updatedAt: now })
      .where(eq(s.bikyBookingReceipts.id, newReceipt.id)).returning();
    await tx.insert(s.auditEvents).values({
      workspaceId: app.workspaceId, customerId: customer!.id,
      actorType: "system", eventType: "biky_booking_confirmed",
      entityType: "appointment", entityId: appt!.id,
      data: { bookingId: booking.booking_id, source: "biky", date: booking.starts_at },
    });
    return updated!;
  });

  if (receipt.notificationState === "submitted") {
    return { bookingId: booking.booking_id, appointmentId: receipt.appointmentId!, state: "submitted", notified: true };
  }

  const [claim] = await app.db.update(s.bikyBookingReceipts)
    .set({ notificationState: "processing", leaseUntil: new Date(now.getTime() + 120_000), updatedAt: now })
    .where(and(
      eq(s.bikyBookingReceipts.id, receipt.id),
      or(inArray(s.bikyBookingReceipts.notificationState, ["pending", "failed"]),
        and(eq(s.bikyBookingReceipts.notificationState, "processing"), lt(s.bikyBookingReceipts.leaseUntil, now))),
    )).returning({ id: s.bikyBookingReceipts.id });
  if (!claim) {
    return { bookingId: booking.booking_id, appointmentId: receipt.appointmentId!, state: "processing", notified: false };
  }

  try {
    const delivery = await notifier(booking);
    await app.db.update(s.bikyBookingReceipts).set({
      notificationState: "submitted", notificationProviderId: delivery.providerId,
      notificationChannel: delivery.channel, leaseUntil: null, updatedAt: app.clock.now(),
    }).where(eq(s.bikyBookingReceipts.id, receipt.id));
    return { bookingId: booking.booking_id, appointmentId: receipt.appointmentId!, state: "submitted", notified: true };
  } catch (error) {
    await app.db.update(s.bikyBookingReceipts).set({
      notificationState: "failed", leaseUntil: null, updatedAt: app.clock.now(),
    }).where(eq(s.bikyBookingReceipts.id, receipt.id));
    logger.error("biky.booking_notification_failed", { reason: error instanceof Error ? error.message : "delivery_failed" });
    throw error;
  }
}
