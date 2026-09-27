/**
 * Detección determinista de intenciones y extracción de hechos del mensaje
 * del cliente. No sustituye al LLM: sirve para
 *  - recuperar la información comercial correcta antes de llamar al modelo,
 *  - disparar alertas/aprobaciones aunque el modelo no las proponga,
 *  - operar el motor demo sin LLM.
 */
import { FACT_DEFS, type CustomerProfile, type FactKey } from "./facts";
import { parseMoneyMentions } from "./money";
import { escapeRegExp, normalize } from "./text";

export const INTENTS = [
  "greeting",
  "ask_price",
  "ask_bonus",
  "ask_financing",
  "ask_quote",
  "ask_insurance",
  "ask_warranty",
  "ask_availability",
  "ask_features",
  "ask_documents",
  "request_mario",
  "ready_to_buy",
  "discount_request",
  "special_condition",
  "credit_approved",
  "test_drive",
  "appointment",
  "not_interested",
  "objection",
] as const;
export type Intent = (typeof INTENTS)[number];

export const INTENT_LABELS: Record<Intent, string> = {
  greeting: "saludó",
  ask_price: "preguntó precio",
  ask_bonus: "preguntó por bonos/promociones",
  ask_financing: "preguntó por financiamiento",
  ask_quote: "pidió cotización",
  ask_insurance: "preguntó por seguro",
  ask_warranty: "preguntó por garantía",
  ask_availability: "preguntó disponibilidad",
  ask_features: "preguntó características",
  ask_documents: "preguntó por documentos",
  request_mario: "pidió hablar con Mario",
  ready_to_buy: "quiere comprar/cerrar",
  discount_request: "pidió descuento",
  special_condition: "pidió una condición especial",
  credit_approved: "reporta crédito aprobado",
  test_drive: "pidió prueba de manejo",
  appointment: "habló de una cita/visita",
  not_interested: "dijo que ya no le interesa",
  objection: "expresó una objeción",
};

const INTENT_PATTERNS: Record<Intent, RegExp[]> = {
  greeting: [/^(hola|buen(os|as) (dias|tardes|noches)|que tal|buenas)\b/],
  ask_price: [/\bprecio/, /cuanto (cuesta|sale|esta|vale|me sale)/, /en cuanto (sale|esta|queda)/],
  ask_bonus: [/\bbono/, /\bpromo(cion)?/, /\boferta/],
  ask_financing: [/credito/, /financ/, /mensualidad/, /\btasa\b/, /\benganche/, /\bplazo/, /a meses/, /al mes\b/],
  ask_quote: [/cotiza/, /\bcorrida\b/],
  ask_insurance: [/\bseguro\b/, /aseguradora/],
  ask_warranty: [/garantia/],
  ask_availability: [/disponib/, /existencia/, /entrega inmediata/, /\bstock\b/, /(tienen|hay|tendran) (el |la |en )?(color|blanco|negro|gris|rojo|azul|plata)/, /\bcolor(es)?\b/],
  ask_features: [/rendimiento/, /km por litro/, /\bmotor\b/, /caballos/, /cajuela/, /equipamiento/, /(trae|tiene) (camara|pantalla|carplay|android|sensores|quemacocos)/, /seguridad/],
  ask_documents: [/papeles/, /documentos/, /requisitos/, /que (necesito|ocupo) para/],
  request_mario: [/(hablar|platicar) con (mario|el asesor|un asesor|una persona|alguien|un humano)/, /(que me (llame|marque)|pasame con|comunicame con) (mario|el asesor|un asesor)/, /\bmario\b.*(llam|marc|habl|atiend)/],
  ready_to_buy: [/lo quiero( ya| comprar| apartar)?\s*([.!,]|$)/, /me lo llevo/, /(cuando|donde|como) (firmo|lo aparto|lo pago|cerramos)/, /apart(a|alo|amelo)\b/, /ya me decidi/, /vamos a cerrar/, /quiero (comprarlo|cerrar|apartarlo)/, /listo para (comprar|firmar|cerrar)/],
  discount_request: [/(mas|otro|extra|un) descuento/, /me (lo )?(dejas|das) en/, /mejor precio/, /rebaja/, /me haces (un|algun) descuento/, /precio especial/],
  special_condition: [/sin enganche/, /enganche diferido/, /(dejar|tomar|recibir) (mi|el) (auto|carro|coche) a cuenta/, /a cuenta (mi|el) (auto|carro)/, /con tarjeta/, /a nombre de otra persona/, /sin buro/, /sin comprobar ingresos/, /tasa (especial|preferencial)/],
  credit_approved: [/(me )?aprobaron (el |mi )?credito/, /(credito|financiamiento) (ya )?(salio |fue |quedo )?aprobado/, /ya (me )?(salio|autorizaron)/],
  test_drive: [/prueba de manejo/, /manejarlo/, /probarlo/, /test drive/],
  appointment: [/\bcita\b/, /(ir|pasar|pasarme|visitar)(los)? (a la agencia|a verlo|por la agencia)/, /agencia/, /(el )?(sabado|domingo|lunes|martes|miercoles|jueves|viernes)\b/],
  not_interested: [/ya no me interesa/, /(ya )?compre (otro|en otra)/, /no gracias/, /no me interesa/],
  objection: [/(esta|muy|bien|algo) car[oa]/, /fuera de (mi )?presupuesto/, /lo voy a pensar/, /no estoy seguro/, /(mensualidad|tasa) (muy )?alta/],
};

export function detectIntents(text: string): Set<Intent> {
  const n = normalize(text);
  const out = new Set<Intent>();
  for (const intent of INTENTS) {
    if (INTENT_PATTERNS[intent].some((re) => re.test(n))) out.add(intent);
  }
  return out;
}

export interface CatalogVehicle {
  model: string;
  aliases: string[];
  versions: string[];
  hasHybrid: boolean;
}

function modelRegex(v: CatalogVehicle): RegExp {
  const names = [v.model, ...v.aliases].map((n) => escapeRegExp(normalize(n)).replace(/\\-/g, "[- ]?").replace(/-/g, "[- ]?"));
  return new RegExp(`(^|[^a-z0-9])(${names.join("|")})($|[^a-z0-9])`);
}

export function mentionedModels(text: string, catalog: CatalogVehicle[]): string[] {
  const n = normalize(text);
  return catalog.filter((v) => modelRegex(v).test(n)).map((v) => v.model);
}

export interface ExtractedFact {
  key: FactKey;
  value: string;
  numericValue: number | null;
  evidence: string;
  confidence: "high" | "medium" | "low";
}

const COMPETITOR_TERMS = [
  "toyota", "mazda", "nissan", "kia", "hyundai", "volkswagen", "vw", "chevrolet", "mg", "chirey", "byd", "suzuki", "ford",
  "yaris", "corolla", "rav4", "versa", "sentra", "kicks", "x-trail", "rio", "k3", "seltos", "sportage", "mazda 2", "mazda 3",
  "cx-3", "cx-30", "cx-5", "jetta", "virtus", "taos", "tiguan", "aveo", "onix", "tracker", "accent", "creta", "tucson",
];

const FEATURE_TERMS: Array<[RegExp, string]> = [
  [/camara (de )?(reversa|trasera)/, "cámara de reversa"],
  [/(apple )?carplay|android auto/, "Apple CarPlay / Android Auto"],
  [/pantalla/, "pantalla táctil"],
  [/quemacocos|sunroof/, "quemacocos"],
  [/sensores/, "sensores de estacionamiento"],
  [/asientos de piel|piel/, "asientos de piel"],
  [/honda sensing|asistencias (de manejo)?|frenado automatico/, "asistencias de manejo (Honda Sensing)"],
  [/cajuela (grande|amplia)|mucho espacio|espacio/, "espacio / cajuela amplia"],
  [/(transmision )?automatic[oa]/, "transmisión automática"],
];

const NUMBER_WORDS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8 };


/**
 * Extrae hechos del mensaje del cliente. `lastAskedFact` es el dato que
 * Sofía preguntó en su último mensaje (para interpretar respuestas cortas).
 */
export function extractFacts(
  text: string,
  catalog: CatalogVehicle[],
  opts: { lastAskedFact?: FactKey | null; profile?: CustomerProfile } = {},
): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const n = normalize(text);
  /** Fragmento literal (normalizado) que coincidió: la evidencia siempre es texto del cliente. */
  const hit = (re: RegExp): string | null => n.match(re)?.[0] ?? null;
  const add = (f: ExtractedFact) => {
    if (!facts.some((x) => x.key === f.key && x.value === f.value)) facts.push(f);
  };

  // Nombre
  const nameMatch = text.match(/(?:me llamo|mi nombre es|soy)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/);
  if (nameMatch) add({ key: "name", value: nameMatch[1]!, numericValue: null, evidence: nameMatch[0], confidence: "high" });
  else if (opts.lastAskedFact === "name" && /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,2}\.?$/.test(text.trim())) {
    add({ key: "name", value: text.trim().replace(/\.$/, ""), numericValue: null, evidence: text.trim(), confidence: "medium" });
  }

  // Modelo y versión
  const models = mentionedModels(text, catalog);
  const primaryModel = models[0] ?? (typeof opts.profile?.vehicle_interest === "string" ? opts.profile.vehicle_interest : null);
  if (models[0]) add({ key: "vehicle_interest", value: models[0], numericValue: null, evidence: models[0], confidence: "high" });
  const vehicle = catalog.find((v) => v.model === primaryModel);
  if (vehicle) {
    const version = [...vehicle.versions]
      .sort((a, b) => b.length - a.length)
      .find((ver) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalize(ver))}($|[^a-z0-9])`).test(n));
    if (version) add({ key: "version", value: version, numericValue: null, evidence: version, confidence: "high" });
  }

  // Montos: se asocian por palabra clave cercana; si no hay, por la última pregunta de Sofía.
  // Cada monto se asocia a la palabra clave de SU cláusula ("80 mil de enganche, 6 mil de mensualidad").
  const clauses = text.split(/[,;!?]|\.(?!\d)|\s+y\s+|\s+pero\s+/i);
  const moneyClauses = clauses.flatMap((clause) => parseMoneyMentions(clause).map((m) => ({ m, clause: normalize(clause) })));
  for (const { m, clause } of moneyClauses) {
    let key: FactKey | null = null;
    if (/enganche/.test(clause)) key = "down_payment";
    else if (/mensualidad|al mes|mensual|por mes|cada mes/.test(clause)) key = "target_monthly_payment";
    else if (/presupuesto|gastar|hasta|maximo|tengo para|traigo/.test(clause)) key = "budget";
    else if (moneyClauses.length === 1 && opts.lastAskedFact && ["down_payment", "target_monthly_payment", "budget"].includes(opts.lastAskedFact)) {
      key = opts.lastAskedFact;
    }
    if (key) add({ key, value: String(m.value), numericValue: m.value, evidence: m.raw, confidence: "high" });
  }

  // Forma de pago
  const cash = hit(/de contado|pago de contado|pagarlo completo/);
  const financing = hit(/credito|financiamiento|financiad[oa]|financiar|a meses|mensualidad(es)?|enganche/);
  if (cash) add({ key: "payment_method", value: "cash", numericValue: null, evidence: cash, confidence: "high" });
  else if (financing && !/sin credito/.test(n)) add({ key: "payment_method", value: "financing", numericValue: null, evidence: financing, confidence: "medium" });

  // Plazo
  const termMonths = n.match(/\b(12|18|24|36|48|60|72|84)\s*meses\b/);
  const termYears = n.match(/\ba\s*(\d|uno|dos|tres|cuatro|cinco|seis)\s*anos\b/);
  if (termMonths) add({ key: "term_months", value: termMonths[1]!, numericValue: Number(termMonths[1]), evidence: termMonths[0], confidence: "high" });
  else if (termYears) {
    const y = Number(termYears[1]) || NUMBER_WORDS[termYears[1]!] || { tres: 3, cuatro: 4, cinco: 5, seis: 6 }[termYears[1]!] || 0;
    if (y > 0) add({ key: "term_months", value: String(y * 12), numericValue: y * 12, evidence: termYears[0], confidence: "medium" });
  }

  // Pasajeros
  const pax = n.match(/\bsomos\s+(\d|un[oa]?|dos|tres|cuatro|cinco|seis|siete|ocho)\b/) ?? n.match(/\b(\d|dos|tres|cuatro|cinco|seis|siete|ocho)\s+(personas|pasajeros|integrantes)\b/);
  if (pax) {
    const v = Number(pax[1]) || NUMBER_WORDS[pax[1]!] || 0;
    if (v > 0) add({ key: "passengers", value: String(v), numericValue: v, evidence: pax[0], confidence: "high" });
  } else if (opts.lastAskedFact === "passengers") {
    const bare = n.match(/^\s*(\d|dos|tres|cuatro|cinco|seis|siete|ocho)\b/);
    const v = bare ? Number(bare[1]) || NUMBER_WORDS[bare[1]!] || 0 : 0;
    if (v > 0) add({ key: "passengers", value: String(v), numericValue: v, evidence: bare![0], confidence: "medium" });
  }

  // Uso
  const keywordFacts: Array<[FactKey, string, RegExp, ExtractedFact["confidence"]]> = [
    ["usage_type", "family", /famili[a-z]*|mis hijos|mi esposa|mi esposo|los ninos|la escuela/, "high"],
    ["usage_type", "work", /trabajo|chamba|negocio|oficina|visitar clientes/, "medium"],
    ["usage_type", "rideshare", /\buber\b|\bdidi\b|plataforma/, "high"],
    ["usage_type", "personal", /(uso|para) personal|para mi sol[oa]/, "medium"],
    ["driving_profile", "city", /ciudad/, "high"],
    ["driving_profile", "highway", /carretera/, "high"],
    ["driving_profile", "travel", /viaj[a-z]*|road ?trip|salir de la ciudad/, "medium"],
    ["fuel_economy_importance", "high", /rendimiento|gaste poco|ahorrar gasolina|consuma poco|economic[oa]/, "medium"],
  ];
  for (const [key, value, re, confidence] of keywordFacts) {
    const ev = hit(re);
    if (ev) add({ key, value, numericValue: null, evidence: ev, confidence });
  }

  const km = n.match(/(\d[\d,.]*)\s*(mil)?\s*(km|kilometros)\s*(al|por|cada)\s*ano/);
  if (km) {
    const v = Number(km[1]!.replace(/[,.]/g, "")) * (km[2] ? 1000 : 1);
    add({ key: "annual_mileage", value: String(v), numericValue: v, evidence: km[0], confidence: "high" });
  }

  // Híbrido / gasolina
  const hybrid = hit(/\bhibrid[oa]s?\b/);
  const gas = hit(/(de|a) gasolina|prefiero gasolina/);
  if (hybrid && !/no (quiero|me interesa) (un |el )?hibrid/.test(n)) {
    add({ key: "powertrain_preference", value: "hybrid", numericValue: null, evidence: hybrid, confidence: "medium" });
  } else if (gas) {
    add({ key: "powertrain_preference", value: "gas", numericValue: null, evidence: gas, confidence: "medium" });
  }

  // Características
  for (const [re, label] of FEATURE_TERMS) {
    const ev = hit(re);
    if (ev) add({ key: "desired_features", value: label, numericValue: null, evidence: ev, confidence: "medium" });
  }

  // Tiempo de compra
  const timing: Array<[RegExp, string]> = [
    [/(hoy mismo|lo antes posible|ya mismo|esta semana|urge|de inmediato)/, "immediate"],
    [/(este mes|fin de mes|esta quincena|la otra quincena|antes de que acabe el mes)/, "this_month"],
    [/(proximo mes|siguiente mes|en un mes|en dos meses|en 2 meses|en tres meses|en 3 meses)/, "1_3_months"],
    [/(medio ano|en 6 meses|en seis meses|fin de ano|en unos meses)/, "3_6_months"],
    [/(solo (estoy )?(viendo|cotizando)|nada mas (viendo|cotizando)|explorando|apenas (estoy )?viendo)/, "exploring"],
  ];
  for (const [re, v] of timing) {
    if (re.test(n)) {
      add({ key: "purchase_timing", value: v, numericValue: null, evidence: n.match(re)![0], confidence: "medium" });
      break;
    }
  }

  // Auto actual
  const current = text.match(/(?:tengo|traigo|manejo|actualmente (?:tengo|manejo)) (?:un|una) ([A-ZÁÉÍÓÚa-z][\w-]+(?: [\w-]+)?(?: \d{4})?)/);
  if (current && !/hij|espos|famil|presupuesto|enganche/.test(normalize(current[1]!))) {
    add({ key: "current_vehicle", value: current[1]!, numericValue: null, evidence: current[0], confidence: "medium" });
  }

  // Competencia
  if (/(tambien|estoy) (estoy )?(viendo|cotizando|comparando)|contra (el|la)|vs\.?|comparado con|me ofrecen/.test(n)) {
    for (const term of COMPETITOR_TERMS) {
      if (new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}($|[^a-z0-9])`).test(n)) {
        add({ key: "competitors", value: term, numericValue: null, evidence: term, confidence: "medium" }); // el término aparece literal
      }
    }
  }

  // Objeciones
  const objections: Array<[RegExp, string]> = [
    [/(esta|muy|bien|algo) car[oa]|fuera de (mi )?presupuesto/, "precio"],
    [/mensualidad (muy )?alta/, "mensualidad"],
    [/tasa (muy )?alta|intereses (muy )?altos/, "tasa"],
    [/lo voy a pensar|no estoy segur/, "indeciso"],
  ];
  for (const [re, v] of objections) {
    const ev = hit(re);
    if (ev) add({ key: "objections", value: v, numericValue: null, evidence: ev, confidence: "medium" });
  }

  // Señales de interés
  const signals: Array<[RegExp, string]> = [
    [/me (encanta|gusta mucho|late)/, "le gusta el modelo"],
    [/prueba de manejo|manejarlo|probarlo/, "quiere prueba de manejo"],
    [/lo quiero( ya)?\s*([.!,]|$)|me lo llevo|apartar|aparto/, "quiere apartar/comprar"],
    [/(cuando|donde) (firmo|lo aparto)/, "pregunta por cierre"],
  ];
  for (const [re, v] of signals) {
    const ev = hit(re);
    if (ev) add({ key: "interest_signals", value: v, numericValue: null, evidence: ev.trim(), confidence: "medium" });
  }

  return facts.filter((f) => FACT_DEFS[f.key] !== undefined);
}

/** ¿Qué dato estaba preguntando este mensaje de Sofía? (para interpretar respuestas cortas) */
export function detectAskedFact(sofiaMessage: string): FactKey | null {
  const questions = sofiaMessage.split(/(?<=[?.!])\s+/).filter((s) => s.includes("?"));
  for (const q of questions.reverse()) {
    const nq = normalize(q);
    for (const def of Object.values(FACT_DEFS)) {
      if (def.askPatterns.some((re) => re.test(nq))) return def.key;
    }
  }
  return null;
}
