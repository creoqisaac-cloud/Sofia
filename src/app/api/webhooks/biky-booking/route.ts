import { createHash, timingSafeEqual } from "node:crypto";
import { getAppContext } from "@/server/app";
import { logger } from "@/server/lib/logger";
import { ConfirmedBookingSchema } from "@/server/biky/booking-contract";
import { acceptConfirmedBooking } from "@/server/biky/booking-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function validToken(header: string | null, expected: string): boolean {
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const supplied = createHash("sha256").update(header.slice(7)).digest();
  const saved = createHash("sha256").update(expected).digest();
  return timingSafeEqual(supplied, saved);
}

/**
 * BIKY Flows HTTP node -> Sofía. The sender maps *confirmed calendar event*
 * fields to ConfirmedBookingSchema; a Funnel card without a real booking ID
 * is not sufficient evidence. Protect this endpoint with a private token.
 */
export async function POST(request: Request) {
  const expected = process.env.SOFIA_BIKY_BOOKING_WEBHOOK_TOKEN ?? "";
  if (!expected) return new Response("Not configured", { status: 503 });
  if (!validToken(request.headers.get("authorization"), expected)) return new Response("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) return new Response("Too large", { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 16_384) return new Response("Too large", { status: 413 });
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const parsed = ConfirmedBookingSchema.safeParse(data);
  if (!parsed.success) return Response.json({ error: "Datos de reserva inválidos." }, { status: 400 });
  try {
    const result = await acceptConfirmedBooking(await getAppContext(), parsed.data);
    return Response.json(result, { status: result.state === "processing" ? 202 : 200 });
  } catch (error) {
    logger.error("biky.booking_ingest_error", { reason: error instanceof Error ? error.message : "unknown" });
    // Source may safely retry using the same provider booking_id.
    return Response.json({ error: "No se completó el procesamiento. Reintenta el evento." }, { status: 503 });
  }
}
