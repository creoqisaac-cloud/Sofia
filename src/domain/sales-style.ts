/**
 * Estilo de venta de Sofía (determinista, sin IA).
 *
 * - Mario define su estilo (tono, emojis, urgencia, firma, cadencia de seguimiento).
 * - Sofía adapta el cierre del mensaje al día de la semana y al momento del mes
 *   (lunes agenda, viernes aparta, sábado visita, domingo sin presión, cierre de mes…).
 * - Todos los mensajes que Sofía redacta para seguimiento, indicaciones, citas y material
 *   del modelo salen de aquí. Ninguno contiene cifras inventadas: solo lo que Mario escribió
 *   o lo que está registrado.
 */
import { normalize } from "./text";

export type StyleTone = "cercano" | "formal";
export type StyleUrgency = "suave" | "normal" | "alta";

export interface SalesStyle {
  assistantName: string;
  advisorName: string;
  agency: string;
  tone: StyleTone;
  /** 0 = sin emojis, 1 = uno por mensaje, 2 = hasta dos. */
  emojis: 0 | 1 | 2;
  urgency: StyleUrgency;
  /** Firma opcional al final de mensajes de seguimiento/indicaciones. */
  signature: string;
  /** Días sin respuesta para cada intento de seguimiento (1.º, 2.º, 3.º…). */
  followupDays: number[];
  /** Enganche sano sugerido (fracción del precio). Abajo de esto Sofía sugiere alternativas. */
  healthyDownPct: number;
  /** Frase propia de Mario por día (0 = domingo … 6 = sábado); reemplaza la de Sofía. */
  dayPhrases: Partial<Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", string>>;
  /** No mandar seguimientos en domingo. */
  restOnSunday: boolean;
}

export const DEFAULT_STYLE: SalesStyle = {
  assistantName: "Sofía",
  advisorName: "Mario Abarca",
  agency: "Honda Valle Oriente",
  tone: "cercano",
  emojis: 1,
  urgency: "normal",
  signature: "",
  followupDays: [1, 3, 7, 15, 30],
  healthyDownPct: 0.2,
  dayPhrases: {},
  restOnSunday: true,
};

const str = (v: unknown, max: number, fallback: string) => (typeof v === "string" ? v.trim().slice(0, max) : fallback);

/** Mezcla lo guardado con los valores por omisión, descartando lo inválido. */
export function resolveStyle(raw: unknown): SalesStyle {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const days = Array.isArray(r.followupDays)
    ? r.followupDays.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 120).sort((a, b) => a - b).slice(0, 8)
    : DEFAULT_STYLE.followupDays;
  const phrases: SalesStyle["dayPhrases"] = {};
  if (r.dayPhrases && typeof r.dayPhrases === "object") {
    for (const [k, v] of Object.entries(r.dayPhrases as Record<string, unknown>)) {
      if (/^[0-6]$/.test(k) && typeof v === "string" && v.trim()) phrases[k as keyof SalesStyle["dayPhrases"]] = v.trim().slice(0, 240);
    }
  }
  const pct = Number(r.healthyDownPct);
  return {
    assistantName: str(r.assistantName, 40, DEFAULT_STYLE.assistantName) || DEFAULT_STYLE.assistantName,
    advisorName: str(r.advisorName, 60, DEFAULT_STYLE.advisorName) || DEFAULT_STYLE.advisorName,
    agency: str(r.agency, 80, DEFAULT_STYLE.agency) || DEFAULT_STYLE.agency,
    tone: r.tone === "formal" ? "formal" : "cercano",
    emojis: r.emojis === 0 || r.emojis === 2 ? r.emojis : 1,
    urgency: r.urgency === "suave" || r.urgency === "alta" ? r.urgency : "normal",
    signature: str(r.signature, 120, ""),
    followupDays: days.length ? days : DEFAULT_STYLE.followupDays,
    healthyDownPct: Number.isFinite(pct) && pct >= 0.05 && pct <= 0.6 ? pct : DEFAULT_STYLE.healthyDownPct,
    dayPhrases: phrases,
    restOnSunday: r.restOnSunday === false ? false : true,
  };
}

// ───────── hora local de México ─────────

export interface LocalParts {
  weekday: number; // 0 = domingo
  day: number;
  month: number; // 1-12
  year: number;
  hour: number;
  daysInMonth: number;
}

export function mxParts(now: Date, timeZone = "America/Mexico_City"): LocalParts {
  const f = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", day: "numeric", month: "numeric", year: "numeric", hour: "numeric", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday ?? "Sun");
  const year = Number(p.year);
  const month = Number(p.month);
  return { weekday: Math.max(0, weekday), day: Number(p.day), month, year, hour: Number(p.hour) % 24, daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate() };
}

/** "2026-11" del momento dado (hora de México). */
export function periodOf(date: Date): string {
  const p = mxParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const name = MONTH_NAMES[(m ?? 1) - 1] ?? period;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}
export function monthIndexFromName(word: string): number | null {
  const i = MONTH_NAMES.indexOf(normalize(word).replace("setiembre", "septiembre"));
  return i >= 0 ? i : null;
}

// ───────── jugada del día ─────────

export interface DayPlay {
  weekday: number;
  label: string;
  /** Qué busca Sofía hoy (se muestra a Mario). */
  focus: string;
  /** Llamado a la acción del día (tú / usted). */
  cta: { tu: string; usted: string };
  /** Gancho de urgencia (cierre de mes, fin de semana), solo si el estilo lo permite. */
  hook: { tu: string; usted: string } | null;
}

const DAYS: Array<Omit<DayPlay, "weekday" | "hook">> = [
  { label: "Domingo", focus: "Sin presión: mantener la relación", cta: { tu: "Sin prisa; cuando gustes lo revisamos con calma.", usted: "Sin prisa; cuando guste lo revisamos con calma." } },
  { label: "Lunes", focus: "Arranque de semana: agendar visita o prueba de manejo", cta: { tu: "¿Te aparto un espacio esta semana para que lo veas y lo manejes?", usted: "¿Le aparto un espacio esta semana para que lo vea y lo maneje?" } },
  { label: "Martes", focus: "Resolver dudas y armar corrida", cta: { tu: "¿Te preparo tu corrida con el enganche que te acomode?", usted: "¿Le preparo su corrida con el enganche que le acomode?" } },
  { label: "Miércoles", focus: "Dar valor: fotos, video y comparativos", cta: { tu: "Si quieres te mando fotos y video de la versión que te interesa.", usted: "Si gusta le mando fotos y video de la versión que le interesa." } },
  { label: "Jueves", focus: "Preparar el fin de semana", cta: { tu: "¿Te queda venir el sábado? Así lo dejamos listo.", usted: "¿Le queda venir el sábado? Así lo dejamos listo." } },
  { label: "Viernes", focus: "Cierre de semana: apartar", cta: { tu: "Si lo dejamos apartado hoy, te aseguro la unidad para el fin de semana.", usted: "Si lo dejamos apartado hoy, le aseguro la unidad para el fin de semana." } },
  { label: "Sábado", focus: "Visita hoy en agencia", cta: { tu: "Hoy estamos en agencia; si te late pasar, aquí te esperamos.", usted: "Hoy estamos en agencia; si gusta pasar, aquí lo esperamos." } },
];

export function dayPlaybook(now: Date, style: SalesStyle): DayPlay {
  const p = mxParts(now);
  const base = DAYS[p.weekday]!;
  const own = style.dayPhrases[String(p.weekday) as keyof SalesStyle["dayPhrases"]];
  const cta = own ? { tu: own, usted: own } : base.cta;
  let hook: DayPlay["hook"] = null;
  if (style.urgency !== "suave") {
    if (p.daysInMonth - p.day <= 6) {
      hook = { tu: "Estamos en cierre de mes; si quieres avanzar, es buen momento para revisar tu caso con Mario.", usted: "Estamos en cierre de mes; si desea avanzar, es buen momento para revisar su caso con Mario." };
    } else if (style.urgency === "alta" && (p.weekday === 4 || p.weekday === 5)) {
      hook = { tu: "Las unidades se mueven rápido antes del fin de semana.", usted: "Las unidades se mueven rápido antes del fin de semana." };
    }
  }
  return { weekday: p.weekday, label: base.label, focus: own ? `${base.focus} (frase de Mario)` : base.focus, cta, hook };
}

export function greetingFor(now: Date): string {
  const h = mxParts(now).hour;
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

// ───────── redacción ─────────

const EMOJI = { wave: "👋", car: "🚗", spark: "✨", calendar: "📅", camera: "📸", party: "🎉", hand: "🙌" } as const;

function limitEmojis(text: string, max: number): string {
  let seen = 0;
  return text
    .replace(/\p{Extended_Pictographic}️?/gu, (m) => (seen++ < max ? m : ""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,!?])/g, "$1")
    .trim();
}

/** Ajusta pronombres de una indicación de Mario para dirigirla al cliente. */
export function toCustomerVoice(text: string, tone: StyleTone): string {
  let t = text.trim().replace(/^(que|q)\s+/i, "").replace(/^[:\-–\s]+/, "").replace(/\s+y que\s+/gi, " y ");
  if (tone === "cercano") {
    t = t
      .replace(/\bsu\b/gi, (m) => (m[0] === "S" ? "Tu" : "tu"))
      .replace(/\bsus\b/gi, (m) => (m[0] === "S" ? "Tus" : "tus"))
      .replace(/\b(le|lo|la) (esperamos|espero|mando|envío|envio|aparto|guardo|llamo|marco|confirmo|comparto|apartamos|tenemos)\b/gi, (_m, _p, v: string) => `te ${v}`)
      .replace(/\bél mismo\b|\bella misma\b/gi, "tú mismo")
      .replace(/\bpuede\b/gi, (m) => (m[0] === "P" ? "Puedes" : "puedes"));
  }
  if (!t) return t;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

export type ComposeKind = "followup" | "directive" | "appointment" | "media" | "unit";

export interface ComposeInput {
  kind: ComposeKind;
  style: SalesStyle;
  now: Date;
  firstName?: string | null;
  model?: string | null;
  /** Intento de seguimiento (1 = primero). */
  attempt?: number;
  /** Texto que Mario escribió en su indicación. */
  custom?: string | null;
  /** Novedad registrada del modelo. */
  note?: string | null;
  /** Material adjunto: tipos que van en el mensaje. */
  mediaKinds?: string[];
  appointment?: { at: Date; kindLabel: string } | null;
  purpose?: "followup" | "promo" | "info" | "appointment" | "custom";
}

function mediaPhrase(kinds: string[], model: string | null | undefined, tu: boolean): string | null {
  if (!kinds.length) return null;
  const set = new Set(kinds);
  const parts = [set.has("photo") && "fotos", set.has("video") && "un video", set.has("flyer") && "la promoción", set.has("sheet") && "la ficha técnica"].filter(Boolean) as string[];
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}` : parts[0]!;
  return `${tu ? "Te comparto" : "Le comparto"} ${what}${model ? ` del ${model}` : ""} ${EMOJI.camera}`;
}

/** Redacta un mensaje listo para WhatsApp con el estilo de Mario y el día de hoy. */
export function composeMessage(input: ComposeInput): string {
  const { style, now } = input;
  const tu = style.tone === "cercano";
  const name = input.firstName?.trim() ? ` ${input.firstName.trim()}` : "";
  const model = input.model ?? null;
  const day = dayPlaybook(now, style);
  const hi = tu ? `¡Hola${name}! ${EMOJI.wave}` : `${greetingFor(now)}${name}.`;
  const me = `Soy ${style.assistantName}, del equipo de ${style.advisorName} en ${style.agency}.`;
  const lines: string[] = [];
  const media = mediaPhrase(input.mediaKinds ?? [], model, tu);

  switch (input.kind) {
    case "appointment": {
      const at = input.appointment?.at;
      const when = at
        ? at.toLocaleString("es-MX", { timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })
        : "la fecha acordada";
      lines.push(hi, `${tu ? "Te" : "Le"} escribo para confirmar ${tu ? "tu" : "su"} ${input.appointment?.kindLabel.toLowerCase() ?? "cita"} del ${when}${model ? ` para el ${model}` : ""}. ${EMOJI.calendar}`);
      lines.push(tu ? "¿Me confirmas si sigue en pie? Si necesitas moverla, dime qué horario te acomoda." : "¿Me confirma si sigue en pie? Si necesita moverla, dígame qué horario le acomoda.");
      break;
    }
    case "unit": {
      lines.push(hi, input.custom ? toCustomerVoice(input.custom, style.tone) : `${tu ? "Tengo" : "Tenemos"} novedades de la unidad${model ? ` ${model}` : ""} que ${tu ? "te" : "le"} interesa.`);
      if (media) lines.push(media);
      lines.push(tu ? "¿Cuándo te queda venir a verla?" : "¿Cuándo le queda venir a verla?");
      break;
    }
    case "media": {
      lines.push(hi, media ?? `${tu ? "Te" : "Le"} comparto información${model ? ` del ${model}` : ""}.`);
      if (input.custom) lines.push(toCustomerVoice(input.custom, style.tone));
      else if (input.note) lines.push(input.note.trim());
      lines.push(tu ? day.cta.tu : day.cta.usted);
      break;
    }
    case "directive": {
      lines.push(hi);
      if (input.custom) lines.push(toCustomerVoice(input.custom, style.tone));
      else if (input.purpose === "promo" || input.purpose === "info") {
        lines.push(input.note ? input.note.trim() : `${tu ? "Te" : "Le"} escribo con novedades${model ? ` del ${model}` : ""}.`);
      } else lines.push(`${me} ${tu ? "¿Cómo vas con" : "¿Cómo va con"} ${model ? `lo del ${model}` : tu ? "tu búsqueda de auto" : "su búsqueda de auto"}?`);
      if (media) lines.push(media);
      // Si Mario ya puso pregunta, día o cita en su mensaje, no se agrega otro cierre.
      const ownClose = input.custom && /\?|\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[nñ]ana|hoy|cita|esperamos|espero)\b/i.test(input.custom);
      if (input.purpose !== "appointment" && !ownClose) lines.push(tu ? day.cta.tu : day.cta.usted);
      break;
    }
    case "followup":
    default: {
      const attempt = Math.max(1, input.attempt ?? 1);
      if (attempt === 1) {
        lines.push(hi, `${me} ${tu ? "¿Pudiste revisar" : "¿Pudo revisar"} la información${model ? ` del ${model}` : ""}? Quedo atenta a cualquier duda.`);
      } else if (attempt === 2) {
        lines.push(hi, input.note ? `${tu ? "Te" : "Le"} cuento una novedad${model ? ` del ${model}` : ""}: ${input.note.trim()}` : `${tu ? "Te" : "Le"} escribo para dar seguimiento${model ? ` a lo del ${model}` : ""}.`);
        if (media) lines.push(media);
      } else if (attempt === 3) {
        lines.push(hi, tu ? `¿Sigues buscando auto o ya lo resolviste? Me ayuda saberlo para no molestarte ${EMOJI.hand}` : "¿Sigue buscando auto o ya lo resolvió? Me ayuda saberlo para no importunarle.");
      } else {
        lines.push(hi, `${me} ${tu ? "Pasaba a saludarte" : "Pasaba a saludarle"}.${model ? ` Seguimos con el ${model} para cuando ${tu ? "quieras" : "guste"} revisarlo.` : ""}`);
        if (input.note) lines.push(input.note.trim());
      }
      if (attempt !== 3) lines.push(tu ? day.cta.tu : day.cta.usted);
      break;
    }
  }

  if (day.hook && input.kind !== "appointment" && (input.kind !== "followup" || (input.attempt ?? 1) <= 2)) lines.push(tu ? day.hook.tu : day.hook.usted);
  if (style.signature) lines.push(style.signature);
  return limitEmojis(lines.filter(Boolean).join("\n"), style.emojis);
}

/** ¿Qué intento de seguimiento toca, según los días sin respuesta? 0 = todavía no. */
export function followupAttemptDue(daysWithoutReply: number, attemptsSent: number, style: SalesStyle): number {
  const next = attemptsSent + 1;
  const threshold = style.followupDays[Math.min(attemptsSent, style.followupDays.length - 1)]!;
  if (attemptsSent >= style.followupDays.length + 2) return 0;
  return daysWithoutReply >= threshold ? next : 0;
}
