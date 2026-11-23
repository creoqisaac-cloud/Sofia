/**
 * Lector de conversaciones pegadas desde WhatsApp (sin API).
 *
 * Mario copia mensajes de WhatsApp (iPhone, Android o WhatsApp Web) y los pega en Sofía.
 * Formatos que se reconocen:
 *   [23/11/26, 10:32:15 a.m.] Juan Pérez: Hola
 *   23/11/26 10:32 - Juan Pérez: Hola
 *   [10:32, 23/11/2026] Juan Pérez: Hola
 * Si no hay encabezados, cada renglón es un mensaje del cliente (varios mensajes seguidos).
 * Renglones sin encabezado debajo de uno con encabezado son continuación de ese mensaje.
 */
import { normalize } from "./text";

export interface PastedMessage {
  sender: "customer" | "mario";
  body: string;
  /** Nombre como aparece en WhatsApp (si venía). */
  author: string | null;
  hasMedia: boolean;
}

const HEADER =
  /^\s*\[?\s*((?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s*)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?\s?m\.?)?(?:,\s*\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})?)\s*\]?\s*(?:-\s*)?([^:\n]{1,60}?):\s?(.*)$/i;

const MEDIA_LINE = /^<?\s*(multimedia omitido|media omitted|imagen omitida|image omitted|video omitido|video omitted|audio omitido|audio omitted|sticker omitido|sticker omitted|documento omitido|document omitted|gif omitido)\s*>?$/i;
const SYSTEM_LINE = /(cifrad[oa]s? de extremo a extremo|end-to-end encrypted|se elimin[oó] este mensaje|this message was deleted|mensajes temporales|cambi[oó] (su|el) n[uú]mero)/i;

/** ¿El autor es Mario (o "Tú"/"Yo" en el teléfono de Mario)? */
function isAdvisor(author: string, advisorNames: string[]): boolean {
  const a = normalize(author).replace(/[^a-zñ ]/g, "").trim();
  if (!a) return false;
  if (["tu", "yo", "you", "me"].includes(a)) return true;
  return advisorNames.some((n) => {
    const x = normalize(n).trim();
    return x.length >= 3 && (a === x || a.startsWith(`${x} `) || x.startsWith(`${a} `) || a === x.split(" ")[0]);
  });
}

export function parsePastedChat(input: string, advisorNames: string[] = ["Mario", "Mario Abarca"]): PastedMessage[] {
  const lines = input.replace(/\r\n?/g, "\n").replace(/[‎‏‪-‮]/g, "").split("\n");
  const hasHeaders = lines.some((l) => HEADER.test(l));
  const out: PastedMessage[] = [];

  if (!hasHeaders) {
    for (const raw of lines) {
      const body = raw.trim();
      if (!body || SYSTEM_LINE.test(body)) continue;
      const media = MEDIA_LINE.test(body);
      out.push({ sender: "customer", body: media ? "[El cliente mandó una foto o archivo]" : body, author: null, hasMedia: media });
    }
    return out;
  }

  for (const raw of lines) {
    const m = raw.match(HEADER);
    if (m) {
      const author = m[2]!.trim();
      const text = m[3]!.trim();
      if (SYSTEM_LINE.test(text)) continue;
      const media = MEDIA_LINE.test(text);
      out.push({
        sender: isAdvisor(author, advisorNames) ? "mario" : "customer",
        body: media ? "[El cliente mandó una foto o archivo]" : text,
        author,
        hasMedia: media,
      });
    } else if (raw.trim() && out.length) {
      const last = out[out.length - 1]!;
      last.body = `${last.body}\n${raw.trim()}`.trim();
    } else if (raw.trim()) {
      out.push({ sender: "customer", body: raw.trim(), author: null, hasMedia: false });
    }
  }
  return out.filter((m) => m.body.length > 0);
}

/**
 * Une varios mensajes seguidos del cliente en un solo texto para entenderlos juntos
 * ("hola" + "cuanto sale" + "la hrv" + "con 50 mil de enganche").
 * Cada mensaje queda como oración propia para que los montos no se mezclen.
 */
export function mergeBurst(bodies: string[]): string {
  const parts = bodies.map((b) => b.trim()).filter(Boolean);
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i]!;
    const next = parts[i + 1];
    // "50 mil" + "de enganche" → una sola frase; lo demás, oraciones separadas.
    const continues = next !== undefined && /^(de|del|y|con|a|al|en|para|por|o|mas|más|pero|sin)\b/i.test(next) && !/[.!?…]$/.test(cur);
    out += continues ? `${cur} ` : /[.!?…]$/.test(cur) ? `${cur} ` : `${cur}. `;
  }
  return out.trim();
}
