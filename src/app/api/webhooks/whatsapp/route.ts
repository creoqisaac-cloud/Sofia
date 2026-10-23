import { getAppContext } from "@/server/app";
import { logger } from "@/server/lib/logger";
import { extractMetaTextMessages, verifyMetaChallenge, verifyMetaSignature } from "@/server/whatsapp/meta";
import { processWhatsAppMessage } from "@/server/whatsapp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Meta webhook challenge: uses a separate private verify token, not web login. */
export async function GET(request: Request) {
  const challenge = verifyMetaChallenge(new URL(request.url).searchParams, process.env.WHATSAPP_VERIFY_TOKEN ?? "");
  return challenge
    ? new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } })
    : new Response("Forbidden", { status: 403 });
}

/** Never parse, log or process an unverified webhook. */
export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!secret || !phoneNumberId || !accessToken) return new Response("Not configured", { status: 503 });
  if (Number(request.headers.get("content-length") ?? "0") > 256 * 1024) return new Response("Too large", { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 256 * 1024) return new Response("Too large", { status: 413 });
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return new Response("Forbidden", { status: 403 });
  }
  let payload: unknown;
  try { payload = JSON.parse(raw); }
  catch { return new Response("Invalid JSON", { status: 400 }); }
  const messages = extractMetaTextMessages(payload, phoneNumberId);
  if (!messages.length) return Response.json({ received: true, messages: 0 });
  try {
    const app = await getAppContext();
    let sent = 0, manual = 0, duplicate = 0;
    for (const msg of messages) {
      const result = await processWhatsAppMessage(app, msg, {
        phoneNumberId, accessToken, apiVersion: process.env.WHATSAPP_GRAPH_VERSION ?? "v26.0",
        autoReply: process.env.SOFIA_WHATSAPP_AUTOREPLY === "true",
      });
      if (result === "sent") sent++;
      if (result === "manual") manual++;
      if (result === "duplicate") duplicate++;
    }
    return Response.json({ received: true, messages: messages.length, sent, manual, duplicate });
  } catch (error) {
    logger.error("whatsapp.webhook_failed", { error: error instanceof Error ? error.message : "unknown" });
    // Ask Meta to retry; the inbound message IDs are deduplicated in Postgres.
    return new Response("Retry later", { status: 503 });
  }
}
