/**
 * Learns how Mario writes from HIS authenticated outbound messages in Sofía.
 *
 * Privacy model:
 * - no customer text, telephone, exact message or quote leaves this service;
 * - only aggregate writing habits go to the LLM;
 * - never learns commercial "facts", commitments or authority from a style sample;
 * - scope is one workspace, and only messages explicitly authored by Mario.
 *
 * Historical messages from external BIKY are NOT read until a permitted
 * integration actually imports them with verifiable human authorship.
 */
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";

export interface MarioVoiceProfile {
  sampleCount: number;
  meanLength: number;
  paragraphStyle: "compacto" | "varios_parrafos";
  tone: "campechano" | "profesional_cercano" | "formal";
  greeting: "que_onda" | "hola" | "directo";
  usesCompare: boolean;
  usesOye: boolean;
  usesMira: boolean;
  emoji: "casi_nunca" | "ocasional" | "frecuente";
  question: "directa" | "sin_abusar";
}

const threshold = (matched: number, size: number, ratio = 0.18) =>
  size > 0 && matched / size >= ratio;

/** Pure, deterministic style inference. Never returns raw message content. */
export function analyzeMarioVoice(messages: readonly string[]): MarioVoiceProfile | null {
  const valid = messages.map(m => m.trim()).filter(m =>
    m.length >= 12 && m.length <= 1200 &&
    !/^(https?:\/\/|\[sistema\]|contraseña|password)/i.test(m),
  );
  if (valid.length < 6) return null;
  const n = valid.length;
  const lower = valid.map(m => m.toLocaleLowerCase("es-MX"));
  const count = (re: RegExp) => lower.filter(m => re.test(m)).length;
  const qonda = count(/(?:^|\s)[¡!]?qu[eé]\s+onda\b/);
  const hola = count(/(?:^|\s)[¡!]?hola\b/);
  const amigo = count(/\b(?:compare|compadre|compa)\b/);
  const usted = count(/\b(?:usted|su\s+(?:veh[ií]culo|solicitud)|estimad[oa])\b/);
  const friendly = count(/\b(?:oye|mira|jalo|claro|va|ándale|andale|perfecto)\b/);
  const emojis = count(/[\p{Extended_Pictographic}]/u);
  const meanLength = Math.round(valid.reduce((n, m) => n + m.length, 0) / valid.length);
  return {
    sampleCount: n,
    meanLength,
    paragraphStyle: threshold(valid.filter(m => m.includes("\n\n")).length, n, 0.35) ? "varios_parrafos" : "compacto",
    tone: threshold(usted, n, 0.45) ? "formal" : threshold(amigo + friendly, n, 0.22) ? "campechano" : "profesional_cercano",
    greeting: qonda > 0 && qonda >= hola ? "que_onda" : hola > 0 ? "hola" : "directo",
    usesCompare: threshold(amigo, n, 0.12),
    usesOye: threshold(count(/\boye\b/), n, 0.12),
    usesMira: threshold(count(/\bmira\b/), n, 0.12),
    emoji: emojis / n >= 0.5 ? "frecuente" : emojis / n >= 0.15 ? "ocasional" : "casi_nunca",
    question: threshold(valid.filter(m => m.includes("?")).length, n, 0.35) ? "directa" : "sin_abusar",
  };
}

export async function loadMarioVoiceProfile(db: Db, workspaceId: string): Promise<MarioVoiceProfile | null> {
  const rows = await db.select({ body: s.messages.body })
    .from(s.messages)
    .where(and(eq(s.messages.workspaceId, workspaceId), eq(s.messages.sender, "mario")))
    .orderBy(desc(s.messages.createdAt))
    .limit(200);
  return analyzeMarioVoice(rows.map(row => row.body));
}

export function renderMarioVoiceProfile(profile: MarioVoiceProfile | null): string {
  if (!profile) return "";
  const pace = profile.meanLength <= 145
    ? "Mensajes breves y sin explicaciones de más."
    : profile.meanLength <= 360 ? "Mensajes de longitud media, pero directos." : "Detalla cuando el cliente lo necesite sin redactar un correo.";
  const greeting = profile.greeting === "que_onda" ? "Suele arrancar con 'qué onda' cuando la conversación es informal."
    : profile.greeting === "hola" ? "Suele iniciar con un hola natural."
      : "Prefiere entrar directo al asunto.";
  return `<mario_voice_patterns>
Patrones agregados de ${profile.sampleCount} mensajes AUTÉNTICOS enviados por Mario en Sofía.
Úsalos solo para el estilo, NUNCA para conocer promociones, aprobar algo o copiar conversaciones ajenas.
Tono: ${profile.tone}. Formato: ${profile.paragraphStyle}. ${pace}
${greeting}
Modismos frecuentes: ${[
  profile.usesCompare ? "compare/compadre (solo si encaja con el trato del cliente)" : "",
  profile.usesOye ? "oye" : "",
  profile.usesMira ? "mira" : "",
].filter(Boolean).join(", ") || "sin muletillas frecuentes"}.
Emojis: ${profile.emoji}. Preguntas: ${profile.question}.
La muestra describe tendencias, no exige repetir ninguna muletilla.
</mario_voice_patterns>`;
}
