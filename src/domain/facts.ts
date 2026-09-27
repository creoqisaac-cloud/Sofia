/**
 * Catálogo de hechos del perfil del prospecto y reglas de fusión.
 *
 * El perfil se construye progresivamente. Ningún campo es obligatorio.
 * - Hechos "single": el nuevo valor reemplaza al anterior, pero el anterior
 *   se conserva en la bitácora como `superseded`.
 * - Hechos "multi": se acumulan (unión), nunca se pierden valores compatibles.
 * - Dependencias: si cambia el modelo de interés, la versión anterior deja de
 *   ser compatible y se retira (a menos que llegue una versión nueva).
 */
import { parseMoneyMentions } from "./money";
import { normalize } from "./text";

export const FACT_KEYS = [
  "name",
  "phone",
  "vehicle_interest",
  "version",
  "usage_type",
  "driving_profile",
  "annual_mileage",
  "passengers",
  "fuel_economy_importance",
  "powertrain_preference",
  "desired_features",
  "budget",
  "down_payment",
  "target_monthly_payment",
  "payment_method",
  "term_months",
  "purchase_timing",
  "current_vehicle",
  "competitors",
  "objections",
  "interest_signals",
] as const;
export type FactKey = (typeof FACT_KEYS)[number];

export type FactKind = "text" | "number" | "money" | "enum" | "list";
export type FactValue = string | number | string[];
export type CustomerProfile = Partial<Record<FactKey, FactValue>>;

export interface FactDef {
  key: FactKey;
  label: string;
  kind: FactKind;
  enumValues?: readonly string[];
  enumLabels?: Record<string, string>;
  /** Prioridad para preguntar (menor = antes). null = no se pregunta activamente. */
  askPriority: number | null;
  /** Pregunta natural sugerida (la usa el motor demo y como guía para el LLM). */
  question?: string;
  /** Patrones que indican que una oración está pidiendo este dato. */
  askPatterns: RegExp[];
  min?: number;
  max?: number;
  dependsOn?: FactKey;
}

const USAGE = ["personal", "family", "work", "rideshare"] as const;
const DRIVING = ["city", "highway", "travel"] as const;
const LEVELS = ["low", "medium", "high"] as const;
const POWERTRAIN = ["hybrid", "gas", "open"] as const;
const PAYMENT = ["cash", "financing", "undecided"] as const;
const TIMING = ["immediate", "this_month", "1_3_months", "3_6_months", "exploring"] as const;

export const FACT_DEFS: Record<FactKey, FactDef> = {
  name: {
    key: "name",
    label: "Nombre",
    kind: "text",
    askPriority: 0,
    question: "¿Con quién tengo el gusto?",
    askPatterns: [/con quien tengo el gusto/, /(como te llamas|cual es tu nombre|me compartes tu nombre|me regalas tu nombre)/],
  },
  phone: {
    key: "phone",
    label: "Teléfono",
    kind: "text",
    askPriority: null,
    askPatterns: [/(tu|un) (numero|telefono|celular|whats)/],
  },
  vehicle_interest: {
    key: "vehicle_interest",
    label: "Modelo de interés",
    kind: "text",
    askPriority: 1,
    question: "¿Qué modelo tienes en mente o te gustaría que te recomiende alguno?",
    askPatterns: [/que (modelo|auto|carro|coche|vehiculo|camioneta)/, /cual (modelo|auto|carro|coche|vehiculo) te (interesa|gusta|llama)/],
  },
  version: {
    key: "version",
    label: "Versión",
    kind: "text",
    askPriority: 7,
    question: "¿Ya tienes alguna versión en mente o te platico las diferencias?",
    askPatterns: [/que version/, /cual version/, /version (te interesa|buscas|prefieres)/],
    dependsOn: "vehicle_interest",
  },
  usage_type: {
    key: "usage_type",
    label: "Uso principal",
    kind: "list",
    enumValues: USAGE,
    enumLabels: { personal: "Personal", family: "Familiar", work: "Trabajo", rideshare: "Plataforma (Uber/DiDi)" },
    askPriority: 2,
    question: "¿Para qué lo usarías principalmente: uso personal, familiar o de trabajo?",
    askPatterns: [/para que (lo |la )?(usarias|vas a usar|lo quieres|la quieres|lo necesitas)/, /uso (le )?(darias|vas a dar|principal)/],
  },
  driving_profile: {
    key: "driving_profile",
    label: "Tipo de manejo",
    kind: "list",
    enumValues: DRIVING,
    enumLabels: { city: "Ciudad", highway: "Carretera", travel: "Viajes" },
    askPriority: 4,
    question: "¿Manejas más en ciudad o también sales a carretera?",
    askPatterns: [/(manejas|lo usarias|circulas) (mas )?(en )?(ciudad|carretera)/, /ciudad o (en )?carretera/],
  },
  annual_mileage: {
    key: "annual_mileage",
    label: "Kilometraje anual estimado",
    kind: "number",
    askPriority: null,
    askPatterns: [/cuantos (km|kilometros)/],
    min: 500,
    max: 250_000,
  },
  passengers: {
    key: "passengers",
    label: "Pasajeros habituales",
    kind: "number",
    askPriority: 3,
    question: "¿Cuántas personas suelen viajar contigo?",
    askPatterns: [/cuantas personas/, /cuantos (pasajeros|son en)/, /cuantos van/],
    min: 1,
    max: 15,
  },
  fuel_economy_importance: {
    key: "fuel_economy_importance",
    label: "Importancia del rendimiento",
    kind: "enum",
    enumValues: LEVELS,
    enumLabels: { low: "Baja", medium: "Media", high: "Alta" },
    askPriority: null,
    askPatterns: [/(que tan importante|te importa).*(rendimiento|gasolina|consumo)/],
  },
  powertrain_preference: {
    key: "powertrain_preference",
    label: "Preferencia híbrido/gasolina",
    kind: "enum",
    enumValues: POWERTRAIN,
    enumLabels: { hybrid: "Híbrido", gas: "Gasolina", open: "Abierto" },
    askPriority: 9,
    question: "¿Te interesa más la versión híbrida o la de gasolina?",
    askPatterns: [/hibrid[oa] o (de )?gasolina/, /gasolina o hibrid/, /te interesa (mas )?(la )?(version )?hibrid/],
  },
  desired_features: {
    key: "desired_features",
    label: "Características deseadas",
    kind: "list",
    askPriority: null,
    askPatterns: [/que (caracteristicas|equipamiento)/, /que te gustaria que (tuviera|trajera)/],
  },
  budget: {
    key: "budget",
    label: "Presupuesto",
    kind: "money",
    askPriority: 10,
    question: "¿Qué presupuesto tienes pensado?",
    askPatterns: [/presupuesto/],
    min: 1_000,
    max: 10_000_000,
  },
  down_payment: {
    key: "down_payment",
    label: "Enganche",
    kind: "money",
    askPriority: 8,
    question: "¿Con cuánto de enganche te gustaría arrancar?",
    askPatterns: [/enganche/],
    min: 1_000,
    max: 10_000_000,
  },
  target_monthly_payment: {
    key: "target_monthly_payment",
    label: "Mensualidad objetivo",
    kind: "money",
    askPriority: 11,
    question: "¿Qué mensualidad te quedaría cómoda?",
    askPatterns: [/mensualidad (te |que te )?(quedaria|gustaria|comoda|ideal|buscas|puedes)/, /cuanto (quieres|puedes|te gustaria) pagar (al mes|mensual)/],
    min: 500,
    max: 500_000,
  },
  payment_method: {
    key: "payment_method",
    label: "Forma de pago",
    kind: "enum",
    enumValues: PAYMENT,
    enumLabels: { cash: "Contado", financing: "Financiamiento", undecided: "Por definir" },
    askPriority: 5,
    question: "¿Lo estás pensando de contado o con financiamiento?",
    askPatterns: [/de contado o (a credito|con financiamiento|financiado)/, /(credito|financiamiento) o (de )?contado/, /como (lo )?(piensas|pensabas|planeas) pagar/],
  },
  term_months: {
    key: "term_months",
    label: "Plazo deseado (meses)",
    kind: "number",
    askPriority: 12,
    question: "¿A qué plazo te gustaría, más o menos?",
    askPatterns: [/a (que|cuantos) (plazo|meses|anos)/, /que plazo/],
    min: 6,
    max: 96,
  },
  purchase_timing: {
    key: "purchase_timing",
    label: "Tiempo de compra",
    kind: "enum",
    enumValues: TIMING,
    enumLabels: {
      immediate: "Inmediato",
      this_month: "Este mes",
      "1_3_months": "1 a 3 meses",
      "3_6_months": "3 a 6 meses",
      exploring: "Explorando",
    },
    askPriority: 6,
    question: "¿Para cuándo te gustaría estrenar?",
    askPatterns: [/para cuando/, /cuando (piensas|planeas|te gustaria|quieres) (comprar|estrenar|adquirir)/],
  },
  current_vehicle: {
    key: "current_vehicle",
    label: "Auto actual",
    kind: "text",
    askPriority: 13,
    question: "¿Actualmente qué auto manejas?",
    askPatterns: [/que (auto|carro|coche) (tienes|manejas|traes)/, /actualmente (que )?(manejas|tienes)/],
  },
  competitors: {
    key: "competitors",
    label: "Competidores considerados",
    kind: "list",
    askPriority: null,
    askPatterns: [/que otr[oa]s? (modelos|marcas|opciones)/],
  },
  objections: {
    key: "objections",
    label: "Objeciones",
    kind: "list",
    askPriority: null,
    askPatterns: [],
  },
  interest_signals: {
    key: "interest_signals",
    label: "Señales de interés",
    kind: "list",
    askPriority: null,
    askPatterns: [],
  },
};

export function isFactKey(key: string): key is FactKey {
  return (FACT_KEYS as readonly string[]).includes(key);
}

export type NormalizeResult =
  | { ok: true; value: FactValue; valueText: string }
  | { ok: false; reason: string };

/**
 * Valida y normaliza un valor propuesto para un hecho.
 * `rawValue` es texto; `numericValue` es el número ya interpretado (si aplica).
 */
export function normalizeFactValue(key: FactKey, rawValue: string, numericValue: number | null): NormalizeResult {
  const def = FACT_DEFS[key];
  const text = rawValue.trim();
  switch (def.kind) {
    case "money":
    case "number": {
      let n = numericValue;
      if (n === null || !Number.isFinite(n)) {
        const money = parseMoneyMentions(text)[0]?.value;
        const plain = Number(text.replace(/[^\d.]/g, ""));
        n = money ?? (Number.isFinite(plain) && plain > 0 ? plain : null);
      }
      if (n === null) return { ok: false, reason: `valor numérico inválido para ${key}` };
      if (def.min !== undefined && n < def.min) return { ok: false, reason: `${key} fuera de rango (${n})` };
      if (def.max !== undefined && n > def.max) return { ok: false, reason: `${key} fuera de rango (${n})` };
      const rounded = def.kind === "money" ? Math.round(n) : Math.round(n);
      return { ok: true, value: rounded, valueText: String(rounded) };
    }
    case "enum": {
      const v = normalize(text).replace(/\s+/g, "_");
      if (!def.enumValues?.includes(v)) return { ok: false, reason: `valor no permitido para ${key}: ${text}` };
      return { ok: true, value: v, valueText: v };
    }
    case "list": {
      // Listas con vocabulario cerrado se normalizan; las libres conservan el texto (la comparación es normalizada).
      const items = text
        .split(/[,;]/)
        .map((s) => (def.enumValues ? normalize(s).replace(/\s+/g, "_") : s.trim().replace(/\s+/g, " ")))
        .filter(Boolean);
      if (items.length === 0) return { ok: false, reason: `lista vacía para ${key}` };
      if (def.enumValues && items.some((i) => !def.enumValues!.includes(i))) {
        return { ok: false, reason: `valor no permitido para ${key}: ${text}` };
      }
      if (items.some((i) => i.length > 80)) return { ok: false, reason: `valor demasiado largo para ${key}` };
      return { ok: true, value: items, valueText: items.join(", ") };
    }
    case "text": {
      if (!text) return { ok: false, reason: `texto vacío para ${key}` };
      if (text.length > 120) return { ok: false, reason: `texto demasiado largo para ${key}` };
      return { ok: true, value: text, valueText: text };
    }
  }
}

export type FactChangeAction = "added" | "reinforced" | "superseded" | "list_extended" | "retracted_dependency";

export interface FactChange {
  key: FactKey;
  action: FactChangeAction;
  previous: FactValue | undefined;
  next: FactValue | undefined;
}

function sameValue(a: FactValue | undefined, b: FactValue | undefined): boolean {
  if (typeof a === "string" && typeof b === "string") return normalize(a) === normalize(b);
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Fusiona nuevos hechos sobre el perfil actual sin perder información compatible.
 * Función pura: devuelve el nuevo perfil y la lista de cambios a persistir.
 */
export function mergeProfile(
  current: CustomerProfile,
  incoming: Array<{ key: FactKey; value: FactValue }>,
): { profile: CustomerProfile; changes: FactChange[] } {
  const profile: CustomerProfile = { ...current };
  const changes: FactChange[] = [];
  const touched = new Set<FactKey>();

  for (const { key, value } of incoming) {
    const def = FACT_DEFS[key];
    const previous = profile[key];
    if (def.kind === "list") {
      const prevList = Array.isArray(previous) ? previous : [];
      const additions = (Array.isArray(value) ? value : [String(value)]).filter(
        (v) => !prevList.some((p) => normalize(p) === normalize(v)),
      );
      if (additions.length === 0) {
        changes.push({ key, action: "reinforced", previous, next: previous });
      } else {
        const next = [...prevList, ...additions];
        profile[key] = next;
        changes.push({ key, action: prevList.length ? "list_extended" : "added", previous, next });
      }
    } else if (previous === undefined) {
      profile[key] = value;
      changes.push({ key, action: "added", previous, next: value });
    } else if (sameValue(previous, value)) {
      changes.push({ key, action: "reinforced", previous, next: previous });
    } else {
      profile[key] = value;
      changes.push({ key, action: "superseded", previous, next: value });
    }
    touched.add(key);
  }

  // Dependencias: la versión pertenece a un modelo.
  for (const def of Object.values(FACT_DEFS)) {
    if (!def.dependsOn) continue;
    const parentChange = changes.find((c) => c.key === def.dependsOn && c.action === "superseded");
    if (parentChange && !touched.has(def.key) && profile[def.key] !== undefined) {
      changes.push({ key: def.key, action: "retracted_dependency", previous: profile[def.key], next: undefined });
      delete profile[def.key];
    }
  }

  return { profile, changes };
}

export function formatFactValue(key: FactKey, value: FactValue): string {
  const def = FACT_DEFS[key];
  if (Array.isArray(value)) return value.map((v) => def.enumLabels?.[v] ?? v).join(", ");
  if (def.kind === "money" && typeof value === "number") return `$${value.toLocaleString("es-MX")}`;
  if (typeof value === "string" && def.enumLabels?.[value]) return def.enumLabels[value]!;
  return String(value);
}

export interface MissingFact {
  key: FactKey;
  label: string;
  priority: number;
  question: string;
}

/**
 * Datos útiles que faltan, en orden de prioridad y según el contexto.
 * Nunca incluye datos ya conocidos: Sofía no debe volver a pedirlos.
 */
export function computeMissingFacts(
  profile: CustomerProfile,
  opts: { nameKnown: boolean; hybridAvailableForInterest: boolean },
): MissingFact[] {
  const payment = profile.payment_method;
  const out: MissingFact[] = [];
  for (const def of Object.values(FACT_DEFS)) {
    if (def.askPriority === null || !def.question) continue;
    if (profile[def.key] !== undefined) continue;
    if (def.key === "name" && opts.nameKnown) continue;
    if (def.dependsOn && profile[def.dependsOn] === undefined) continue;
    if (["down_payment", "target_monthly_payment", "term_months"].includes(def.key) && payment === "cash") continue;
    if (["target_monthly_payment", "term_months"].includes(def.key) && payment !== "financing") continue;
    if (def.key === "budget" && payment === "financing") continue;
    if (def.key === "powertrain_preference" && !opts.hybridAvailableForInterest) continue;
    out.push({ key: def.key, label: def.label, priority: def.askPriority, question: def.question });
  }
  return out.sort((a, b) => a.priority - b.priority);
}
