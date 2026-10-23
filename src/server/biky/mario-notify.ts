import type { ConfirmedBooking } from "./booking-contract";
import { marioBookingSummary } from "./booking-contract";

/**
 * Two supported delivery transports:
 * 1. Existing BIKY Flows via a user-configured custom webhook trigger.
 * 2. Meta Cloud API with an approved utility message template.
 * The transport's HTTP acceptance does not guarantee recipient delivery.
 */
export type MarioNotifyReceipt = { channel: "biky_flow" | "meta_template"; providerId: string };

export async function notifyMarioOfBooking(
  booking: ConfirmedBooking,
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
): Promise<MarioNotifyReceipt> {
  const msg = marioBookingSummary(booking);
  const flowUrl = env.SOFIA_MARIO_NOTIFY_FLOW_URL;
  if (flowUrl) {
    const url = new URL(flowUrl);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error("URL HTTPS inválida para Flows.");
    const key = env.SOFIA_MARIO_NOTIFY_FLOW_TOKEN;
    if (!key) throw new Error("Falta token de integración Flows.");
    const response = await request(url.toString(), {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        event: "mario_booking_confirmed", booking_id: booking.booking_id,
        advisor: "Mario Abarca", message: msg.text, name: booking.customer_name,
        phone: booking.customer_phone, model: booking.model, starts_at: booking.starts_at,
        date: msg.date, time: msg.time, location: booking.location,
      }),
    });
    if (!response.ok) throw new Error(`El webhook de aviso respondió HTTP ${response.status}.`);
    return { channel: "biky_flow", providerId: `flow:${booking.booking_id}` };
  }

  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const to = env.SOFIA_MARIO_WHATSAPP_TO;
  const template = env.SOFIA_MARIO_TEMPLATE;
  const language = env.SOFIA_MARIO_TEMPLATE_LANGUAGE ?? "es_MX";
  const version = env.WHATSAPP_GRAPH_VERSION ?? "v26.0";
  if (!phoneNumberId || !token || !to || !template) {
    throw new Error("No existe transporte configurado para avisar a Mario por WhatsApp.");
  }
  if (!/^\d{10,15}$/.test(to) || !/^[a-z0-9_]+$/.test(template) || !/^v\d+\.\d+$/.test(version) || !/^[a-z]{2}_[A-Z]{2}$/.test(language)) {
    throw new Error("Configuración Meta inválida.");
  }

  const values = [booking.customer_name, msg.date, msg.time, booking.model, booking.customer_phone];
  const response = await request(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "template",
      template: {
        name: template, language: { code: language },
        components: [{ type: "body", parameters: values.map(text => ({ type: "text", text })) }],
      },
    }),
  });
  if (!response.ok) throw new Error(`Meta no aceptó el aviso (HTTP ${response.status}).`);
  const data: unknown = await response.json();
  const id = ((data as { messages?: Array<{ id?: string }> })?.messages ?? [])[0]?.id;
  if (!id) throw new Error("Meta no devolvió el ID de mensaje.");
  return { channel: "meta_template", providerId: id };
}
