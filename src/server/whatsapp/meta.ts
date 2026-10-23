/**
 * Meta WhatsApp Cloud API: webhook verification, decoding and outbound text.
 * No access tokens or full messages are logged.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type WhatsAppText = { id: string; from: string; name: string | null; body: string };

function obj(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function verifyMetaSignature(raw: string, header: string | null, secret: string): boolean {
  if (!secret || !header || !/^sha256=[a-f0-9]{64}$/i.test(header)) return false;
  const received = Buffer.from(header.slice(7), "hex");
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function verifyMetaChallenge(params: URLSearchParams, token: string): string | null {
  const provided = params.get("hub.verify_token") ?? "";
  if (!token || !provided) return null;
  const a = createHmac("sha256", token).update(provided).digest();
  const b = createHmac("sha256", token).update(token).digest();
  if (!timingSafeEqual(a, b) || params.get("hub.mode") !== "subscribe") return null;
  const challenge = params.get("hub.challenge");
  return challenge && /^\d{1,64}$/.test(challenge) ? challenge : null;
}

/** Ignore outgoing delivery receipts and unsupported content types. */
export function extractMetaTextMessages(payload: unknown, phoneNumberId: string): WhatsAppText[] {
  const root = obj(payload);
  if (!root || root.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return [];
  const result: WhatsAppText[] = [];
  for (const entry of root.entry) {
    const changes = obj(entry)?.changes;
    if (!Array.isArray(changes)) continue;
    for (const rawChange of changes) {
      const change = obj(rawChange);
      const value = obj(change?.value);
      const metadata = obj(value?.metadata);
      if (change?.field !== "messages" || metadata?.phone_number_id !== phoneNumberId) continue;
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
      const names = new Map<string, string>();
      for (const contact of contacts) {
        const c = obj(contact);
        const waId = c?.wa_id;
        const n = obj(c?.profile)?.name;
        if (typeof waId === "string" && typeof n === "string") names.set(waId, n.slice(0, 100));
      }
      for (const rawMessage of Array.isArray(value?.messages) ? value.messages : []) {
        const msg = obj(rawMessage);
        const body = obj(msg?.text)?.body;
        if (msg?.type !== "text" || typeof msg.id !== "string" || typeof msg.from !== "string" || typeof body !== "string") continue;
        if (!msg.id.startsWith("wamid.") || !/^\d{10,15}$/.test(msg.from) || !body.trim()) continue;
        result.push({ id: msg.id.slice(0, 240), from: msg.from, name: names.get(msg.from) ?? null, body: body.trim().slice(0, 4000) });
      }
    }
  }
  return result;
}

export async function sendMetaText(input: {
  phoneNumberId: string; accessToken: string; apiVersion: string; to: string; body: string;
}): Promise<string> {
  if (!/^v\d+\.\d+$/.test(input.apiVersion)) throw new Error("Versión Graph API inválida.");
  const response = await fetch(`https://graph.facebook.com/${input.apiVersion}/${encodeURIComponent(input.phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to: input.to,
      type: "text", text: { preview_url: false, body: input.body.slice(0, 4096) },
    }),
  });
  if (!response.ok) throw new Error(`Meta rechazó el envío (HTTP ${response.status}).`);
  const data: unknown = await response.json();
  const first = obj(data);
  const messages = first?.messages;
  const outboundId = Array.isArray(messages) ? obj(messages[0])?.id : undefined;
  if (typeof outboundId !== "string" || !outboundId) throw new Error("Meta no confirmó el identificador de mensaje.");
  return outboundId;
}
