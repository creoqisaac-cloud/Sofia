/**
 * Corrector determinista de mensajes de WhatsApp (sin IA).
 *
 * Los clientes escriben rápido: "presio del sivic", "q enganche ocupo", "kiero la crv",
 * "holaaa cuanto sale la hrv?". Antes de detectar intenciones y datos, Sofía repara el
 * texto palabra por palabra:
 *   1. abreviaturas de chat (q, xq, tmb, porfa, info…),
 *   2. letras repetidas ("siiii" → "si"),
 *   3. modelos con guion escritos de mil formas ("hrv", "h r v", "jrv", "hr-b" → "HR-V"),
 *   4. equivalencia fonética del español (c/s/z, b/v, k/c/qu, h muda, ll/y) contra un
 *      vocabulario de ventas + los modelos del catálogo,
 *   5. distancia de edición pequeña (1 letra en palabras ≥5, 2 en palabras ≥8).
 *
 * Solo se corrigen palabras contra el vocabulario comercial; las palabras comunes del
 * español nunca se tocan. Si hay empate entre dos candidatas, no se corrige.
 */
import { normalize } from "./text";

/** Vocabulario comercial: forma normalizada → forma correcta (con acentos). */
const SALES_WORDS: Record<string, string> = Object.fromEntries(
  [
    "precio", "precios", "crédito", "créditos", "enganche", "enganches", "mensualidad", "mensualidades", "financiamiento", "financiar",
    "financiado", "cotización", "cotizar", "cotízame", "corrida", "contado", "plazo", "plazos", "meses", "seguro", "garantía",
    "disponible", "disponibilidad", "existencia", "prueba", "manejo", "cita", "agencia", "descuento", "promoción", "promociones",
    "bono", "bonos", "oferta", "ofertas", "interesa", "interesado", "interesada", "quiero", "cuánto", "cuesta", "cuestan", "híbrido",
    "híbrida", "gasolina", "rendimiento", "camioneta", "camionetas", "carro", "coche", "versión", "versiones", "colores", "fotos",
    "foto", "video", "videos", "imágenes", "imagen", "documentos", "requisitos", "aprobado", "aprobaron", "apartar", "aparto",
    "comprar", "compra", "sábado", "domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "mañana", "tarde", "presupuesto",
    "ficha", "técnica", "kilómetros", "transmisión", "automático", "automática", "estándar", "entrega", "inmediata", "unidad",
    "unidades", "modelo", "modelos", "seminuevo", "factura", "mensual", "anticipo", "tasa", "interés", "intereses", "comisión",
    "apertura", "buró", "nómina", "ingresos", "comprobante", "domicilio", "identificación", "licencia", "placas", "tenencia",
    "gracias", "hola", "buenas", "tardes", "noches", "días", "cuándo", "dónde", "mándame", "envíame", "información", "necesito",
    "ocupo", "pagos", "pagar", "semana", "quincena", "familia", "trabajo", "cajuela", "pantalla", "cámara", "reversa", "sensores",
    "quemacocos", "asientos", "motor", "caballos", "litro", "litros", "ciudad", "carretera", "espacio", "tienen", "tiene", "verlo",
    "llamar", "marcar", "hablar", "asesor", "flyer", "folleto", "catálogo", "equipamiento", "touring", "sport", "también",
    "porque", "entonces", "favor", "quisiera", "quería", "saber", "cuál", "cuáles", "diferencia", "vale", "sale", "queda",
  ].map((w) => [normalize(w), w]),
);

/** Palabras comunes que jamás se corrigen aunque se parezcan a una del vocabulario. */
const NEVER_TOUCH = new Set(
  [
    "que", "de", "la", "el", "en", "y", "a", "los", "las", "un", "una", "unos", "unas", "por", "con", "para", "es", "lo", "se", "no", "si",
    "mi", "me", "te", "le", "les", "su", "sus", "al", "del", "mas", "pero", "como", "ya", "o", "esta", "este", "eso", "esa", "ese", "hay",
    "muy", "bien", "sin", "sobre", "todo", "toda", "todos", "cuando", "tengo", "tienes", "puedo", "puede", "ver", "vez", "dia", "hoy",
    "mes", "ano", "anos", "caro", "cara", "casa", "cosa", "mesa", "mismo", "misma", "otro", "otra", "algo", "nada", "mucho", "poco",
    "seria", "sería", "fue", "era", "son", "soy", "eres", "estoy", "estas", "estan", "tiempo", "gusto", "gusta", "mejor", "menos",
    "hijo", "hija", "hijos", "esposa", "esposo", "mama", "papa", "uber", "didi", "mil", "pesos", "dinero", "auto", "autos", "mario",
    "sofia", "ok", "va", "sale", "dale", "claro", "sí", "pues", "aqui", "alla", "ahi", "aca", "luego", "ahorita", "rapido", "listo",
    "nuevo", "nueva", "usado", "usada", "blanco", "negro", "gris", "rojo", "azul", "plata", "vino", "verde", "cafe",
  ].map(normalize),
);

/** Abreviaturas y modismos de chat → palabra completa. */
const ABBREVIATIONS: Record<string, string> = {
  q: "que", k: "que", ke: "que", qe: "que", xq: "porque", pq: "porque", porq: "porque", xk: "porque", pk: "porque",
  x: "por", d: "de", tmb: "también", tb: "también", tmbn: "también", tambn: "también", tmbien: "también",
  pls: "por favor", plis: "por favor", xfa: "por favor", xfavor: "por favor", porfa: "por favor", porfis: "por favor",
  info: "información", infor: "información", cel: "celular", msj: "mensaje", bn: "bien", grax: "gracias", grs: "gracias", gcs: "gracias",
  hrs: "horas", toy: "estoy", stoy: "estoy", ta: "está", sta: "está", dnd: "dónde", ola: "hola", hla: "hola", mñn: "mañana",
  mna: "mañana", mñna: "mañana", kiero: "quiero", kero: "quiero", cuant: "cuánto", cto: "cuánto", qnto: "cuánto", knto: "cuánto",
  sl2: "saludos", salu2: "saludos", tons: "entonces", ntons: "entonces", ps: "pues", pz: "pues", pa: "para", aki: "aquí",
  nel: "no", simon: "sí", sip: "sí", sep: "sí", nop: "no", oki: "ok", okis: "ok", vdd: "verdad", cred: "crédito",
  engan: "enganche", mens: "mensualidad", financ: "financiamiento", cotiz: "cotización", tel: "teléfono", wapp: "WhatsApp",
  wsp: "WhatsApp", whats: "WhatsApp", promo: "promoción", promos: "promociones", camio: "camioneta",
};

export interface SpellingFix {
  from: string;
  to: string;
}

export interface RepairedText {
  /** Texto reparado (conserva mayúsculas y signos del original donde no hubo cambio). */
  text: string;
  fixes: SpellingFix[];
}

/** Clave fonética simple del español mexicano. */
export function soundKey(word: string): string {
  let w = normalize(word).replace(/[^a-zñ]/g, "");
  w = w.replace(/ch/g, "§").replace(/h/g, "").replace(/§/g, "ch");
  w = w
    .replace(/qu(?=[ei])/g, "k")
    .replace(/c(?=[ei])/g, "s")
    .replace(/c/g, "k")
    .replace(/q/g, "k")
    .replace(/z/g, "s")
    .replace(/x/g, "s")
    .replace(/v/g, "b")
    .replace(/w/g, "u")
    .replace(/ll/g, "y")
    .replace(/y$/g, "i")
    .replace(/g(?=[ei])/g, "j");
  return w.replace(/([^r])\1+/g, "$1");
}

/** Distancia de Damerau-Levenshtein (transposiciones cuentan 1). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[m]![n]!;
}

function keepCase(original: string, replacement: string): string {
  if (/^[A-ZÁÉÍÓÚÑ]{2,}$/.test(original) && !/-/.test(replacement)) return replacement.toUpperCase();
  if (/^[A-ZÁÉÍÓÚÑ]/.test(original) && /^[a-záéíóúñ]/.test(replacement)) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

/** Diccionario efectivo: vocabulario de ventas + modelos del catálogo (sin guion). */
function buildDictionary(models: string[]) {
  const dict = new Map<string, string>(Object.entries(SALES_WORDS));
  for (const m of models) {
    const n = normalize(m);
    if (/^[a-z0-9ñ]+$/.test(n) && n.length >= 4) dict.set(n, m);
  }
  const bySound = new Map<string, string[]>();
  for (const [n, display] of dict) {
    const k = soundKey(n);
    bySound.set(k, [...(bySound.get(k) ?? []), display]);
  }
  return { dict, bySound };
}

/** Modelos con guion (HR-V, CR-V, BR-V…) escritos como "hrv", "h r v", "jrv", "hr-b", "ache erre ve". */
function repairHyphenModels(text: string, models: string[], fixes: SpellingFix[]): string {
  let out = text;
  for (const m of models) {
    const parts = m.match(/^([A-Za-z]{1,3})-([A-Za-z])$/);
    if (!parts) continue;
    const letters = parts[1]!.toLowerCase().split("");
    const tail = parts[2]!.toLowerCase();
    const letter = (c: string) =>
      c === "h" ? "(?:h|j|ach[eé]?)" : c === "c" ? "(?:c|k|s)" : c === "v" || c === "b" ? "(?:v|b|uve|ve|be)" : c === "r" ? "(?:r|rr|erre|ere)" : c;
    const re = new RegExp(`(^|[^A-Za-z0-9ÁÉÍÓÚáéíóúñÑ])(${letters.map(letter).join("[\\s.-]?")}[\\s.-]?${letter(tail)})(?=$|[^A-Za-z0-9ÁÉÍÓÚáéíóúñÑ])`, "gi");
    out = out.replace(re, (whole, pre: string, word: string) => {
      if (word === m) return whole;
      fixes.push({ from: word, to: m });
      return `${pre}${m}`;
    });
  }
  return out;
}

function correctWord(raw: string, dict: Map<string, string>, bySound: Map<string, string[]>): string | null {
  const n = normalize(raw);
  if (!/^[a-zñ]+$/.test(n) || n.length < 1) return null;
  if (ABBREVIATIONS[n]) return ABBREVIATIONS[n]!;
  if (dict.has(n) || NEVER_TOUCH.has(n)) return null;
  if (n.length < 4) return null;
  if (n.endsWith("s") && (dict.has(n.slice(0, -1)) || NEVER_TOUCH.has(n.slice(0, -1)))) return null;

  // "holaaaa", "siiii", "graciaaas"
  const collapsed = n.replace(/([a-zñ])\1{2,}/g, "$1");
  if (collapsed !== n) {
    if (dict.has(collapsed)) return dict.get(collapsed)!;
    if (NEVER_TOUCH.has(collapsed)) return collapsed;
    if (ABBREVIATIONS[collapsed]) return ABBREVIATIONS[collapsed]!;
  }
  const word = collapsed;

  const sound = bySound.get(soundKey(word));
  if (sound && sound.length === 1) return sound[0]!;

  if (word.length < 5) return null;
  const maxDist = word.length >= 8 ? 2 : 1;
  let best: string | null = null;
  let bestDist = maxDist + 1;
  let tie = false;
  for (const [cand, display] of dict) {
    if (Math.abs(cand.length - word.length) > maxDist) continue;
    if (soundKey(cand[0]!) !== soundKey(word[0]!)) continue;
    const dist = editDistance(word, cand);
    if (dist < bestDist) {
      best = display;
      bestDist = dist;
      tie = false;
    } else if (dist === bestDist && display !== best) {
      tie = true;
    }
  }
  return best && !tie && bestDist <= maxDist ? best : null;
}

/**
 * Repara el mensaje del cliente. `models` son los nombres (y alias) del catálogo para
 * reconocer modelos mal escritos.
 */
export function repairText(text: string, models: string[] = []): RepairedText {
  const fixes: SpellingFix[] = [];
  const { dict, bySound } = buildDictionary(models);
  let out = repairHyphenModels(text, models, fixes);
  // Sin tocar letras pegadas a números ("50k", "4x4") ni correos/ligas.
  out = out.replace(/(?<![0-9@/._A-Za-zÁÉÍÓÚÜáéíóúüÑñ])[A-Za-zÁÉÍÓÚÜáéíóúüÑñ]+(?:-[A-Za-z]+)?(?![0-9@/A-Za-zÁÉÍÓÚÜáéíóúüÑñ])/g, (token: string, offset: number, whole: string) => {
    if (token.includes("-")) return token;
    // "50 k de enganche": la k es "mil", no "que".
    if (/^[kK]$/.test(token) && /\d\s*$/.test(whole.slice(0, offset))) return token;
    const fixed = correctWord(token, dict, bySound);
    if (!fixed || normalize(fixed) === normalize(token)) return token;
    fixes.push({ from: token, to: fixed });
    return keepCase(token, fixed);
  });
  // Signos sueltos repetidos ("???", "!!!!") → uno.
  out = out.replace(/([?!¿¡.])\1+/g, "$1").replace(/[ \t]{2,}/g, " ");
  return { text: out, fixes };
}
