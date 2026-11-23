/**
 * Indicaciones de Mario a Sofía — intérprete DETERMINISTA (sin IA).
 *
 *   "Háblale a los calientes del HR-V con la promo de diciembre"
 *   "Manda el flyer del Civic a todos los tibios"
 *   "Dile a Juan Pérez que ya llegó su unidad"
 *   "A los fríos de noviembre mándales seguimiento mañana"
 *   "Escríbele a los que no contestan del CR-V: tenemos prueba de manejo este sábado"
 *   "Confírmales la cita a los citados de mañana"
 *
 * Solo entiende: devuelve a quién, qué decir, qué material adjuntar y cuándo. El servidor
 * resuelve los clientes, redacta cada mensaje y Mario revisa antes de que entre a la cola.
 */
import type { Temperature } from "./enums";
import { foldText, parseWhen } from "./command";
import { mentionedModels, type CatalogVehicle } from "./intents";
import { repairText } from "./spelling";
import { monthIndexFromName, mxParts } from "./sales-style";

export type DirectivePurpose = "followup" | "promo" | "info" | "appointment" | "custom";
export type MediaKind = "photo" | "video" | "flyer" | "sheet";

export interface DirectiveContext {
  columns: Array<{ id: string; name: string; temperature: Temperature | null }>;
  catalog: CatalogVehicle[];
  customers: Array<{ id: string; name: string }>;
  now: Date;
}

export interface DirectivePlan {
  isDirective: boolean;
  audience: {
    customerIds: string[];
    columnIds: string[];
    temperatures: Temperature[];
    models: string[];
    period: string | null;
    noReplyDays: number | null;
    withAppointment: boolean;
    appointmentDay: string | null;
    all: boolean;
  };
  /** Texto que Mario quiere que se le diga al cliente (si lo escribió). */
  message: string | null;
  media: MediaKind[];
  /** Modelo del material/novedad (si se mencionó uno). */
  model: string | null;
  purpose: DirectivePurpose;
  dueAt: string | null;
  dueLabel: string | null;
  /** Lo que Sofía entendió, en frases cortas para que Mario lo valide. */
  understood: string[];
  warnings: string[];
}

const VERBS =
  /\b(hablale|hablales|habla|hablarle|hablarles|escribele|escribeles|escribe|escribirle|escribirles|mandale|mandales|manda|mandar|mandarle|mandarles|envia|enviale|enviales|enviar|enviarle|enviarles|dile|diles|decirle|decirles|avisale|avisales|avisa|recuerdale|recuerdales|comparte|compartele|compartales|compartiles|contacta|contactale|contactales|invita|invitale|invitales|confirmale|confirmales|confirma|dales seguimiento|dale seguimiento|da seguimiento|seguimiento a|reactiva|reactivale|reactivales|saluda|saludale|saludales)\b/;

const TEMP_WORDS: Array<[RegExp, Temperature[], string]> = [
  [/\b(muy calientes?|calientisimos?|listos para cerrar)\b/, ["very_hot"], "muy calientes"],
  [/\b(calientes?|calientitos?|hot)\b/, ["hot", "very_hot"], "calientes"],
  [/\b(tibios?|tibias?|interesados?|interesadas?)\b/, ["interested"], "tibios"],
  [/\b(frios?|frias?|congelados?|dormidos?)\b/, ["cold"], "fríos"],
];

/** Pasa a minúsculas y sin acentos conservando la longitud (para recortar el texto original). */
function foldKeepLength(s: string): string {
  const folded = [...s].map((c) => {
    const f = c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return f.length === 1 ? (f === "ñ" ? "n" : f) : c.toLowerCase();
  });
  return folded.join("");
}

function firstNameOf(name: string): string {
  return foldText(name.replace(/\(DEMO\)/gi, "")).split(" ")[0] ?? "";
}

/** Para el comando universal: solo verbos dirigidos al cliente, sin chocar con otros comandos. */
const STRONG_VERBS =
  /\b(hablale|hablales|escribele|escribeles|dile|diles|avisale|avisales|mandale|mandales|enviale|enviales|compartele|compartiles|invitale|invitales|confirmale|confirmales|recuerdale|recuerdales|saludale|saludales|reactivale|reactivales|contactale|contactales)\b|\b(manda|envia|comparte)\b.*\b(a (los|las|todos|todas)|flyer|fotos?|video)\b/;

export function looksLikeDirective(text: string): boolean {
  const n = foldText(text);
  if (/\b(correo|mail|email|recuerdame|cotiza\w*|corrida|solicitud|placas|tramite|pedido|factura|vin)\b/.test(n)) return false;
  return STRONG_VERBS.test(n);
}

export function parseDirective(text: string, ctx: DirectiveContext): DirectivePlan {
  const models = ctx.catalog.flatMap((v) => [v.model, ...v.aliases]);
  const repaired = repairText(text, models).text;
  const n = foldText(repaired);
  const understood: string[] = [];
  const warnings: string[] = [];

  // ── Mensaje literal: entre comillas, después de ":" o después de "que …" ──
  let message: string | null = null;
  let audienceText = repaired;
  const quoted = repaired.match(/["“«']([^"”»']{3,})["”»']/);
  if (quoted) {
    message = quoted[1]!.trim();
    audienceText = repaired.replace(quoted[0], " ");
  } else {
    const colon = repaired.indexOf(":");
    if (colon > 0 && colon < repaired.length - 3) {
      message = repaired.slice(colon + 1).trim();
      audienceText = repaired.slice(0, colon);
    } else {
      const folded = foldKeepLength(repaired);
      // "que" que no sea relativo ("los que no contestan", "a los que preguntaron").
      const re = /(?<!\b(?:los|las|el|la|aquellos|aquellas|todos|todas|quienes|lo)\s)\b(que|diciendole|diciendoles|diciendo|para decirle|para decirles|avisandole|avisandoles)\s+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(folded))) {
        const rest = repaired.slice(m.index + m[0].length).trim();
        // "que no contestan / que preguntaron / que tienen cita" describen al público, no el mensaje.
        if (/^(no )?(contestan|contestaron|responden|respondieron|preguntaron|pregunto|tienen|tuvieron|vinieron|estan|andan|quieren|buscan|han)\b/.test(foldText(rest))) continue;
        if (rest.length >= 3) {
          message = rest;
          audienceText = repaired.slice(0, m.index);
        }
        break;
      }
    }
  }
  const na = foldText(audienceText);

  // ── Material ──
  const media = new Set<MediaKind>();
  if (/\b(flyer|flayer|flyers|folleto|volante|publicidad|promo en imagen|imagen de la promo)\b/.test(n)) media.add("flyer");
  if (/\b(fotos?|imagen|imagenes|fotitos?)\b/.test(n)) media.add("photo");
  if (/\b(videos?|video ?clip)\b/.test(n)) media.add("video");
  if (/\b(ficha|ficha tecnica|especificaciones|catalogo)\b/.test(n)) media.add("sheet");

  // ── Modelos ──
  const modelsMentioned = mentionedModels(repaired, ctx.catalog);
  const model = modelsMentioned[0] ?? null;

  // ── Público ──
  const temperatures = new Set<Temperature>();
  const tempLabels: string[] = [];
  for (const [re, temps, label] of TEMP_WORDS) {
    if (re.test(na)) {
      temps.forEach((t) => temperatures.add(t));
      tempLabels.push(label);
      if (label === "muy calientes") break;
    }
  }
  const columnIds: string[] = [];
  for (const c of ctx.columns) {
    const cn = foldText(c.name).replace(/[^a-z0-9 ]/g, "").trim();
    if (cn.length >= 3 && new RegExp(`\\b${cn.replace(/\s+/g, "\\s+")}\\b`).test(na)) columnIds.push(c.id);
  }
  // Las columnas con temperatura ya cubiertas por palabra no se duplican.
  const cols = columnIds.filter((id) => {
    const c = ctx.columns.find((x) => x.id === id)!;
    return !(c.temperature && temperatures.has(c.temperature));
  });

  let period: string | null = null;
  const lp = mxParts(ctx.now);
  // "la promo de diciembre" habla de la promoción, no del mes de los clientes.
  const naMonths = na.replace(/\b(promo|promocion|promociones|bono|bonos|evento|oferta|ofertas|venta|ventas|flyer|campana|precio|precios)\s+(de|del mes de)\s+[a-z]+/g, " ");
  const monthWord = naMonths.match(/\b(?:de|del mes de|en|mes de|para)\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/);
  if (monthWord) {
    const idx = monthIndexFromName(monthWord[1]!)!;
    const diff = idx + 1 - lp.month;
    const year = diff > 6 ? lp.year - 1 : diff < -6 ? lp.year + 1 : lp.year;
    period = `${year}-${String(idx + 1).padStart(2, "0")}`;
  } else if (/\b(de este mes|del mes)\b/.test(na)) {
    period = `${lp.year}-${String(lp.month).padStart(2, "0")}`;
  } else if (/\b(del mes pasado|el mes pasado)\b/.test(na)) {
    const y = lp.month === 1 ? lp.year - 1 : lp.year;
    const m = lp.month === 1 ? 12 : lp.month - 1;
    period = `${y}-${String(m).padStart(2, "0")}`;
  }

  let noReplyDays: number | null = null;
  if (/\b(no (me )?(han )?(contestan|contestado|contestaron|responden|respondido|respondieron)|sin respuesta|me dejaron en visto|en visto|no han dicho nada|perdidos)\b/.test(na)) {
    const d = na.match(/\b(\d{1,2})\s*dias\b/);
    noReplyDays = d ? Number(d[1]) : 3;
  }

  const withAppointment = /\b(citados?|citadas?|con cita|tienen cita|que vienen|agendados?)\b/.test(na);
  let appointmentDay: string | null = null;
  if (withAppointment) appointmentDay = /\bmanana\b/.test(na) ? "tomorrow" : /\bhoy\b/.test(na) ? "today" : null;

  // Clientes por nombre: nombre completo, o nombre de pila único que no sea palabra del comando.
  const customerIds: string[] = [];
  const reserved = new Set(["todos", "todas", "los", "las", "que", "del", "con", "mario", "sofia", ...models.map((m) => foldText(m))]);
  const firstCounts = new Map<string, number>();
  for (const c of ctx.customers) firstCounts.set(firstNameOf(c.name), (firstCounts.get(firstNameOf(c.name)) ?? 0) + 1);
  for (const c of ctx.customers) {
    const full = foldText(c.name.replace(/\(DEMO\)/gi, "")).replace(/[^a-z ]/g, "").trim();
    const parts = full.split(" ").filter(Boolean);
    if (parts.length >= 2 && new RegExp(`\\b${parts.slice(0, 2).join("\\s+")}\\b`).test(na)) {
      customerIds.push(c.id);
      continue;
    }
    const first = parts[0] ?? "";
    if (first.length >= 3 && !reserved.has(first) && firstCounts.get(first) === 1 && new RegExp(`\\b(a|le|con|para|al|y)\\s+${first}\\b`).test(na)) {
      customerIds.push(c.id);
    }
  }
  const ambiguousFirst = [...new Set(ctx.customers.map((c) => firstNameOf(c.name)))].filter(
    (f) => f.length >= 3 && (firstCounts.get(f) ?? 0) > 1 && new RegExp(`\\b(a|le|con|para|al)\\s+${f}\\b`).test(na),
  );
  if (ambiguousFirst.length) warnings.push(`Hay varios clientes llamados ${ambiguousFirst.join(", ")}; escribe también el apellido.`);

  const all = /\b(todos|todas|a todo el mundo|toda la base|todos mis clientes|a todos)\b/.test(na);

  // ── Propósito ──
  let purpose: DirectivePurpose = "followup";
  if (/\b(cita|citas|confirmale|confirmales|confirma)\b/.test(n) && withAppointment) purpose = "appointment";
  else if (/\b(promo|promocion|bono|descuento|oferta|evento|venta nocturna|financiamiento especial|tasa)\b/.test(n)) purpose = "promo";
  else if (/\b(llego|llegaron|ya esta|ya tenemos|disponible|unidad|unidades|inventario|novedad|novedades|nueva version)\b/.test(n)) purpose = "info";
  if (message && purpose === "followup") purpose = "custom";

  // ── Cuándo ──
  const when = parseWhen(n.replace(/\b(citados?|citadas?) de (manana|hoy)\b/g, "citados"), ctx.now);
  const dueAt = when ? when.iso : null;

  const isDirective = VERBS.test(n) || Boolean(message && (temperatures.size || cols.length || customerIds.length || all));

  // ── Resumen ──
  const who: string[] = [];
  if (customerIds.length) who.push(ctx.customers.filter((c) => customerIds.includes(c.id)).map((c) => c.name.replace(/\s*\(DEMO\)/i, "")).join(", "));
  if (tempLabels.length) who.push(`clientes ${tempLabels.join(" y ")}`);
  if (cols.length) who.push(`columna ${ctx.columns.filter((c) => cols.includes(c.id)).map((c) => c.name).join(", ")}`);
  if (withAppointment) who.push(`citados${appointmentDay === "tomorrow" ? " de mañana" : appointmentDay === "today" ? " de hoy" : ""}`);
  if (all && !who.length) who.push("todos los clientes activos");
  if (who.length) understood.push(`Para: ${who.join(" · ")}`);
  if (modelsMentioned.length) understood.push(`Modelo: ${modelsMentioned.join(", ")}`);
  if (period) understood.push(`Del mes: ${period}`);
  if (noReplyDays) understood.push(`Que no contestan hace ${noReplyDays}+ días`);
  if (media.size) understood.push(`Adjuntar: ${[...media].map((k) => ({ photo: "fotos", video: "video", flyer: "flyer", sheet: "ficha técnica" })[k]).join(", ")}`);
  if (message) understood.push(`Mensaje de Mario: “${message}”`);
  else understood.push(`Sofía redacta: ${{ followup: "seguimiento", promo: "promoción/novedad del modelo", info: "novedad del modelo", appointment: "confirmación de cita", custom: "mensaje" }[purpose]}`);
  if (when) understood.push(`Cuándo: ${when.label}`);

  if (!who.length && !modelsMentioned.length && !period && !noReplyDays) warnings.push("No entendí a quién escribirle. Ej.: “a los calientes”, “a Juan Pérez”, “a los del HR-V”, “a todos”.");

  return {
    isDirective,
    audience: {
      customerIds,
      columnIds: cols,
      temperatures: [...temperatures],
      models: modelsMentioned,
      period,
      noReplyDays,
      withAppointment,
      appointmentDay,
      all,
    },
    message,
    media: [...media],
    model,
    purpose,
    dueAt,
    dueLabel: when?.label ?? null,
    understood,
    warnings,
  };
}
