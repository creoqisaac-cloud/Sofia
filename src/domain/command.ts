/**
 * Comando universal de Sofía — interpretación DETERMINISTA de lenguaje natural (es-MX).
 *
 *   texto → intención estructurada + parámetros → (herramienta determinista en el servidor)
 *
 * Este módulo solo entiende; no toca datos. Ninguna cifra comercial sale de aquí: el
 * enganche y el plazo son ENTRADAS de Mario; precio, bono y mensualidad los calcula el motor.
 * La voz usa exactamente este mismo camino (la transcripción es texto).
 */
import { NUMBER_WORDS, parseMoneyMentions, wordsToNumber } from "./money";
import { normalize } from "./text";

export const COMMAND_INTENTS = [
  "quote",
  "find_customer",
  "customer_status",
  "credit_status",
  "documents_status",
  "register_document",
  "schedule_appointment",
  "create_followup",
  "sale_status",
  "update_sale",
  "plate_status",
  "update_plate",
  "draft_email",
  "send_email",
  "today",
  "navigate",
  "unknown",
] as const;
export type CommandIntent = (typeof COMMAND_INTENTS)[number];

/** Intenciones que modifican o envían algo: siempre piden confirmación antes de ejecutar. */
export const MUTATING_INTENTS: ReadonlySet<CommandIntent> = new Set(["register_document", "schedule_appointment", "create_followup", "update_sale", "update_plate", "send_email"]);

export interface CatalogModel {
  model: string;
  aliases: string[];
  versions: string[];
}

export interface CommandParams {
  model?: string;
  version?: string;
  downPayment?: number;
  termMonths?: number;
  customerQuery?: string;
  when?: { iso: string; hasTime: boolean; label: string };
  reason?: string;
  docType?: string;
  target?: string;
  saleField?: "orderNumber" | "invoiceNumber" | "vin" | "customerNumber";
  saleValue?: string;
  plateStatus?: string;
  query?: string;
}

export interface ParsedCommand {
  intent: CommandIntent;
  params: CommandParams;
  raw: string;
}

const WEEKDAYS: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const MONTHS: Record<string, number> = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };
const WORD_ALT = NUMBER_WORDS.join("|");
const NUM = `(\\d+(?:[.,]\\d+)?|(?:(?:${WORD_ALT})(?:\\s+y\\s+|\\s+)?)+)`;

/** normalize() conserva la ñ; para entender comandos la plegamos a "n" ("mañana" → "manana"). */
export function foldText(x: string): string {
  return normalize(x).replace(/ñ/g, "n");
}

const NOT_NAMES = new Set(["registra", "que", "ya", "me", "le", "su", "el", "la", "los", "las", "mi", "un", "una", "hoy", "manana", "cliente", "venta", "correo", "placas", "tramite", "documentos", "es"]);

function toNumber(raw: string): number | null {
  const t = raw.trim();
  if (/^\d/.test(t)) return Number(t.replace(",", "."));
  return wordsToNumber(t.replace(/\s+y\s+/g, " "));
}

export const DOC_KEYWORDS: Array<[RegExp, string]> = [
  [/comprobante de domicilio|comprobante|recibo de (luz|agua|telefono)/, "proof_of_address"],
  [/\bine\b|credencial|identificacion/, "ine"],
  [/nomina|recibos? de nomina|comprobante de ingresos/, "proof_of_income"],
  [/estados? de cuenta/, "bank_statement"],
  [/constancia|situacion fiscal|\brfc\b/, "tax_id"],
  [/\bcurp\b/, "curp"],
  [/carta laboral|carta de trabajo/, "employment_letter"],
];

const NAV_TARGETS: Array<[RegExp, string]> = [
  [/ventas?/, "/sales"],
  [/clientes?/, "/customers"],
  [/agenda|citas|calendario/, "/agenda"],
  [/placas/, "/plates"],
  [/alertas/, "/alerts"],
  [/cotizador|cotizaciones/, "/quote"],
  [/devoluciones/, "/returns"],
  [/inicio|home|hoy/, "/"],
];

/** Monto de enganche: "150 mil", "$150,000", "ciento cincuenta de enganche", "100 de enganche". */
export function parseDownPayment(n: string): number | undefined {
  const around = n.match(new RegExp(`${NUM}\\s*(mil|k)?\\s*(?:pesos\\s*)?de enganche`)) ?? n.match(new RegExp(`enganche (?:de |con )?(?:\\$\\s?)?${NUM}\\s*(mil|k)?`));
  if (around) {
    const base = toNumber(around[1]!);
    if (base !== null && base > 0) return base < 1000 || around[2] ? base * 1000 : base;
  }
  // "con 150 mil" cuando hay contexto de cotización y no se dijo "enganche"
  const money = parseMoneyMentions(n).filter((m) => m.value >= 1000);
  if (money.length === 1) return money[0]!.value;
  const con = n.match(new RegExp(`\\bcon ${NUM}\\s*(mil|k)\\b`));
  if (con) {
    const base = toNumber(con[1]!);
    if (base !== null) return base * 1000;
  }
  return undefined;
}

export function parseTerm(n: string): number | undefined {
  const m = n.match(new RegExp(`${NUM}\\s*meses`));
  if (m) {
    const v = toNumber(m[1]!);
    if (v && v > 0 && v <= 120) return v;
  }
  const y = n.match(new RegExp(`${NUM}\\s*anos\\b`));
  if (y) {
    const v = toNumber(y[1]!);
    if (v && v > 0 && v <= 10) return v * 12;
  }
  return undefined;
}

function findModel(n: string, catalog: CatalogModel[]): { model?: string; version?: string } {
  const squash = (x: string) => normalize(x).replace(/[^a-z0-9]/g, "");
  const tokens = n.split(/\s+/);
  for (const c of catalog) {
    const names = [c.model, ...c.aliases].map(squash);
    const idx = tokens.findIndex((_, i) => names.includes(squash(tokens[i]!)) || names.includes(squash(`${tokens[i]} ${tokens[i + 1] ?? ""}`)));
    if (idx === -1) continue;
    const after = tokens.slice(idx + 1, idx + 4).join(" ");
    const version = [...c.versions].sort((a, b) => b.length - a.length).find((v) => ` ${after} `.includes(` ${normalize(v)} `) || ` ${n} `.includes(` ${normalize(v)} `));
    // Versión dicha pero no registrada ("City Touring"): se conserva para responder con honestidad.
    const said = tokens[idx + 1]?.replace(/[^a-z]/g, "");
    const unknown = !version && said && !/^(con|a|de|en|y|por|para|el|la|una|un|mil|meses|enganche)$/.test(said) && !NUMBER_WORDS.includes(said) ? said : undefined;
    return { model: c.model, version: version ?? (unknown ? unknown.charAt(0).toUpperCase() + unknown.slice(1) : undefined) };
  }
  return {};
}

/** "mañana a las cinco", "hoy 4:30", "el viernes a las 11", "el 12 de octubre a las 10 de la mañana". */
export function parseWhen(n: string, now: Date): CommandParams["when"] | undefined {
  let day: Date | null = null;
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  if (/pasado manana/.test(n)) day = new Date(base.getTime() + 2 * 86_400_000);
  else if (/\bmanana\b/.test(n.replace(/de la manana/g, ""))) day = new Date(base.getTime() + 86_400_000);
  else if (/\bhoy\b/.test(n)) day = base;
  else {
    const wd = n.match(/\b(?:el |este |proximo )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
    if (wd) {
      const target = WEEKDAYS[wd[1]!]!;
      let diff = (target - base.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      day = new Date(base.getTime() + diff * 86_400_000);
    }
    const dm = n.match(/\bel (\d{1,2})(?: de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre))?\b/);
    if (!day && dm) {
      const d = new Date(base);
      if (dm[2]) d.setMonth(MONTHS[dm[2]]!);
      d.setDate(Number(dm[1]));
      if (d < base) {
        if (dm[2]) d.setFullYear(d.getFullYear() + 1);
        else d.setMonth(d.getMonth() + 1);
      }
      day = d;
    }
  }
  const t = n.match(new RegExp(`(?:a las|a la|alas|tipo|como a las|\\bpara las)\\s+${NUM}(?:(?::| y )(\\d{2}|media|cuarto))?\\s*(am|pm|de la manana|de la tarde|de la noche)?`)) ?? n.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) ?? n.match(/\b(\d{1,2}):(\d{2})\b/);
  let hasTime = false;
  if (t) {
    let h = toNumber(t[1]!);
    if (h !== null && h >= 0 && h <= 23) {
      const minRaw = t[2];
      const min = minRaw === "media" ? 30 : minRaw === "cuarto" ? 15 : minRaw ? Number(minRaw) : 0;
      const mer = t[3] ?? "";
      if ((mer === "pm" || mer === "de la tarde" || mer === "de la noche") && h < 12) h += 12;
      else if (!mer && h >= 1 && h <= 7) h += 12; // "a las cinco" en horario de agencia = 17:00
      day = day ?? base;
      day = new Date(day);
      day.setHours(h, min, 0, 0);
      hasTime = true;
    }
  }
  if (!day) return undefined;
  const label = day.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }) + (hasTime ? `, ${day.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })}` : "");
  return { iso: day.toISOString(), hasTime, label };
}

const STOP_AFTER_NAME = /\s(?:manana|hoy|pasado|el|este|proximo|a las|a la|para|por|como|que|con|de enganche|lunes|martes|miercoles|jueves|viernes|sabado|domingo|mañana)\b.*$/;

/** Nombre del cliente tras "a/de/para/con …". Lo resuelve el servidor contra la BD. */
function customerAfter(n: string, patterns: RegExp[]): string | undefined {
  for (const p of patterns) {
    const m = n.match(p);
    if (m?.[1]) {
      const name = m[1].replace(STOP_AFTER_NAME, "").replace(/[¿?¡!.,]/g, "").trim();
      const words = name.split(" ").filter((w) => w && !NOT_NAMES.has(w));
      if (words.length && words.length === name.split(" ").length) return words.slice(0, 3).join(" ");
    }
  }
  return undefined;
}

export function parseCommand(text: string, catalog: CatalogModel[], now: Date): ParsedCommand {
  const raw = text.trim();
  const n = foldText(raw).replace(/[¿?¡!]/g, "").replace(/\s+/g, " ").trim();
  const out = (intent: CommandIntent, params: CommandParams = {}): ParsedCommand => ({ intent, params, raw });
  if (!n) return out("unknown");

  const who = (extra: RegExp[] = []) =>
    customerAfter(n, [...extra, /\b(?:a|de|para|con) ([a-zñ]+(?: [a-zñ]+){0,2})/]);

  // Hoy / pendientes
  if (/^(que|qué) (tengo|hay|me toca)( pendiente)?( para)?( hoy)?$|pendientes? (de|para)? ?hoy|que tengo (hoy|pendiente)|mis pendientes|que sigue hoy/.test(n)) return out("today");

  // Enviar correo (siempre con confirmación)
  if (/\b(envia|enviale|manda|mandale|mandar|enviar)\b.*\b(correo|mail|email)\b/.test(n)) return out("send_email", { customerQuery: who([/\b(?:correo|mail|email)(?: de placas)? (?:de|a|para) ([a-zñ]+(?: [a-zñ]+){0,2})/]) });

  // Borrador de correo
  if (/\b(correo|mail|email)\b/.test(n)) {
    return out("draft_email", { target: /placas/.test(n) ? "plates" : "general", customerQuery: who([/placas (?:de|para) ([a-zñ]+(?: [a-zñ]+){0,2})/, /(?:correo|mail|email) (?:de|a|para) ([a-zñ]+(?: [a-zñ]+){0,2})/]) });
  }

  // Placas
  if (/\bplacas?\b|tramite/.test(n)) {
    const status = /como enviad|enviado|ya (lo )?envie|mandado/.test(n) ? "submitted" : /terminad|complet|listo el tramite|ya salieron/.test(n) ? "completed" : /problema/.test(n) ? "problem" : /en espera|esperando/.test(n) ? "waiting" : undefined;
    if (/\b(marca|pon|cambia|registra)\b/.test(n) && status) return out("update_plate", { plateStatus: status, customerQuery: who([/tramite de ([a-zñ]+(?: [a-zñ]+){0,2})/, /placas de ([a-zñ]+(?: [a-zñ]+){0,2})/]) });
    return out("plate_status", { customerQuery: /cuales|pendientes|tengo/.test(n) && !/ a [a-z]/.test(n) ? undefined : who([/placas (?:de|a|para) ([a-zñ]+(?: [a-zñ]+){0,2})/, /le falta(?:n)? (?:para placas )?a ([a-zñ]+(?: [a-zñ]+){0,2})/]) });
  }

  // Cotización
  const vehicle = findModel(n, catalog);
  if (/\b(cotiza|cotizame|cotizale|cotizar|cotizacion|corrida|cuanto (sale|queda|seria|es)|mensualidad)\b/.test(n) || (vehicle.model && /enganche|meses|anos\b/.test(n))) {
    return out("quote", { ...vehicle, downPayment: parseDownPayment(n), termMonths: parseTerm(n), customerQuery: customerAfter(n, [/\bpara ([a-zñ]+(?: [a-zñ]+){0,1})\s*$/]) });
  }

  // Registrar documento recibido (con confirmación)
  const doc = DOC_KEYWORDS.find(([re]) => re.test(n))?.[1];
  if (doc && /\b(ya (me )?(mando|envio|entrego|trajo|paso|dio)|registra|recibi|llego)\b/.test(n)) {
    return out("register_document", { docType: doc, customerQuery: who([/(?:registra que )?([a-zñ]+(?: [a-zñ]+){0,1}) ya (?:me )?(?:mando|envio|entrego|trajo|paso|dio)/]) });
  }

  // Citas
  if (/\b(agenda|agendale|agendar|agendame|cita)\b/.test(n)) {
    return out("schedule_appointment", {
      customerQuery: who([/\b(?:agenda|agendale|agendar|agendame|cita con|cita a|cita para) (?:a |con )?([a-zñ]+(?: [a-zñ]+){0,2})/]),
      when: parseWhen(n, now),
      reason: /prueba de manejo/.test(n) ? "test_drive" : /entrega/.test(n) ? "delivery" : /firma/.test(n) ? "signature" : "visit",
    });
  }

  // Seguimiento
  if (/\b(recuerdame|recordatorio|seguimiento|dale seguimiento|llamar a|marcarle|marcale|llamale|hablarle)\b/.test(n)) {
    const reason = n.match(/\b(?:para|que) (.+)$/)?.[1];
    return out("create_followup", { customerQuery: who([/(?:llamar a|marcarle a|marcale a|llamale a|hablarle a|seguimiento a|recuerdame (?:llamar|marcarle|hablarle) a) ([a-zñ]+(?: [a-zñ]+){0,2})/]), when: parseWhen(n, now) ?? parseWhen("manana a las 10", now), reason });
  }

  // Actualizar venta (con confirmación)
  const saleField = n.match(/\b(pedido|factura|vin|numero de cliente)\b(?: de ([a-z]+(?: [a-z]+)?))?(?: (?:es|numero|no|#|:|el|la))* ([a-z0-9-]*\d[a-z0-9-]*)/);
  if (saleField && /\b(registra|pon|captura|anota|es|el)\b/.test(n)) {
    const map = { pedido: "orderNumber", factura: "invoiceNumber", vin: "vin", "numero de cliente": "customerNumber" } as const;
    return out("update_sale", { saleField: map[saleField[1] as keyof typeof map], saleValue: saleField[3]!.toUpperCase(), customerQuery: saleField[2]?.replace(/ es$/, "") ?? who([/(?:de|para) ([a-z]+(?: [a-z]+){0,1})\s*$/]) });
  }

  // Navegación
  if (/^(abre|abreme|abrir|ve a|ir a|muestra|muestrame|ensename|ver)\b/.test(n)) {
    if (/\bventa de\b/.test(n)) return out("sale_status", { customerQuery: who([/venta de ([a-zñ]+(?: [a-zñ]+){0,2})/]), target: "open" });
    if (/\b(cliente|ficha) de\b/.test(n)) return out("find_customer", { customerQuery: who([/(?:cliente|ficha) de ([a-zñ]+(?: [a-zñ]+){0,2})/]), target: "open" });
    const nav = NAV_TARGETS.find(([re]) => re.test(n));
    if (nav) return out("navigate", { target: nav[1] });
  }

  if (/\b(credito|solicitud|banco|bbva|banorte)\b/.test(n)) return out("credit_status", { customerQuery: who() });
  if (/\b(documentos?|papeles|papeleria|expediente)\b/.test(n)) return out("documents_status", { customerQuery: who([/(?:le falta(?:n)?|faltan?) a ([a-zñ]+(?: [a-zñ]+){0,2})/]) });
  if (/\b(venta|pedido|factura|entrega)\b/.test(n)) return out("sale_status", { customerQuery: who() });
  if (/\b(que le falta|le falta|como va|que onda con|en que va|estatus de|status de|como esta)\b/.test(n)) {
    return out("customer_status", { customerQuery: who([/(?:que le falta|le falta|como va|que onda con|en que va|estatus de|status de|como esta) (?:a |con |el |la )?([a-zñ]+(?: [a-zñ]+){0,2})/]) });
  }
  const search = n.match(/^(?:busca|buscar|buscame|encuentra|quien es)\s+(?:a |al |el |la )?(.+)$/);
  if (search) return out("find_customer", { query: search[1]!, customerQuery: search[1]! });
  // Texto corto sin verbo: búsqueda directa (nombre, teléfono, pedido, VIN…)
  if (n.split(" ").length <= 3) return out("find_customer", { query: raw, customerQuery: n });
  return out("unknown");
}
