/**
 * toAlexaSpeech: convierte la respuesta del command router (pensada para pantalla) en
 * una frase CORTA para voz. Nunca lee IDs, fuentes, tablas ni datos sensibles
 * (RFC, CURP, correos, teléfonos, VIN, domicilios, datos médicos).
 */
import type { CommandResponse, PendingAction } from "../command/router";

export const DETAIL_IN_APP = "Te dejé el detalle en Sofía.";

/** Quita datos sensibles y ruido visual de un texto antes de leerlo en voz. */
export function scrubForVoice(text: string): string {
  return text
    .replace(/\s*\(DEMO\)/gi, "")
    .replace(/\(datos DEMO\)/gi, "con datos de prueba")
    .replace(/\b[A-ZÑ&]{4}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d\b/gi, "") // CURP
    .replace(/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/gi, "") // RFC
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "") // correo
    .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/g, "") // VIN
    .replace(/(?:\+?52)?\s?\d{10}\b/g, "") // teléfono
    .replace(/\$\s?([\d,]+)\.00\b/g, "$1 pesos")
    .replace(/\$\s?([\d,]+)\.(\d{2})\b/g, "$1 pesos con $2 centavos")
    .replace(/\$\s?([\d,]+)/g, "$1 pesos")
    .replace(/→/g, ",")
    .replace(/[·•]/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,+/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const MONTHS_OFFSET_WORDS = ["hoy", "mañana", "pasado mañana"];

/** "mañana a las 5 de la tarde" / "el viernes 2 de octubre a las 10 de la mañana". */
export function spokenWhen(iso: string, now: Date): string {
  const d = new Date(iso);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  const day =
    days >= 0 && days <= 2
      ? MONTHS_OFFSET_WORDS[days]!
      : `el ${d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}`;
  const h = d.getHours();
  const m = d.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const part = h < 12 ? "de la mañana" : h < 19 ? "de la tarde" : "de la noche";
  const mins =
    m === 0
      ? ""
      : m === 30
        ? " y media"
        : m === 15
          ? " y cuarto"
          : `:${String(m).padStart(2, "0")}`;
  return `${day} a la${h12 === 1 ? "" : "s"} ${h12}${mins} ${part}`;
}

const firstName = (label: string) => {
  const m = label.match(/(?:con|de|a) ([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/);
  return m?.[1] ?? "el cliente";
};

/** Pregunta de confirmación corta: "Voy a agendar a Juan mañana a las 5 de la tarde. ¿Confirmas?" */
export function confirmationSpeech(action: PendingAction, now: Date): string {
  switch (action.type) {
    case "schedule_appointment":
      return `Voy a agendar a ${firstName(action.label)} ${spokenWhen(action.at, now)}. ¿Confirmas?`;
    case "create_followup":
      return `Voy a crear un seguimiento para ${firstName(action.label)} ${spokenWhen(action.dueAt, now)}. ¿Confirmas?`;
    case "register_document":
      return `Voy a marcar como recibido el documento de ${firstName(action.label)}. ¿Confirmas?`;
    case "update_sale":
      return `Voy a actualizar la venta de ${firstName(action.label)}. ¿Confirmas?`;
    case "update_plate":
      return `Voy a actualizar el trámite de placas de ${firstName(action.label)}. ¿Confirmas?`;
    case "send_email":
      return "Voy a enviar el correo. ¿Confirmas?";
    case "save_quote":
      return "Voy a guardar la corrida. ¿Confirmas?";
  }
}

const MAX_ITEMS = 3;

export function toAlexaSpeech(
  res: CommandResponse,
  now: Date,
): { speech: string; detailInApp: boolean } {
  if (res.confirm)
    return {
      speech: confirmationSpeech(res.confirm.action, now),
      detailInApp: false,
    };
  const list = res.blocks.find((b) => b.type === "list");
  const hasEmail = res.blocks.some((b) => b.type === "email");
  if (hasEmail)
    return {
      speech: scrubForVoice(res.say.split(".")[0]!) + `. ${DETAIL_IN_APP}`,
      detailInApp: true,
    };

  switch (res.intent) {
    case "today": {
      if (!list || list.type !== "list" || list.items.length === 0)
        return {
          speech: "No tienes pendientes por ahora.",
          detailInApp: false,
        };
      const items = list.items
        .slice(0, MAX_ITEMS)
        .map((i) => `${i.title}: ${(i.detail ?? "").split("→")[0]!.trim()}`);
      const more = list.items.length > MAX_ITEMS;
      return {
        speech: scrubForVoice(
          `Tienes ${list.items.length} pendiente${list.items.length === 1 ? "" : "s"}. ${items.join(". ")}.${more ? ` ${DETAIL_IN_APP}` : ""}`,
        ),
        detailInApp: more,
      };
    }
    case "find_customer": {
      if (list && list.type === "list" && list.items.length > 1) {
        const names = list.items.slice(0, MAX_ITEMS).map((i) => i.title);
        return {
          speech: scrubForVoice(
            `Encontré ${list.items.length}: ${names.join(", ")}. ¿Cuál?`,
          ),
          detailInApp: list.items.length > MAX_ITEMS,
        };
      }
      return { speech: scrubForVoice(res.say), detailInApp: false };
    }
    case "navigate":
      return {
        speech: "Eso se abre en la pantalla de Sofía.",
        detailInApp: true,
      };
    default: {
      // Frases largas: solo las primeras dos ideas; el resto queda en la app.
      const text = scrubForVoice(res.say);
      const parts = text.split(/(?<=[.;])\s+/);
      if (parts.length > 2 || text.length > 260)
        return {
          speech: `${parts.slice(0, 2).join(" ").slice(0, 240)} ${DETAIL_IN_APP}`,
          detailInApp: true,
        };
      return { speech: text, detailInApp: false };
    }
  }
}
