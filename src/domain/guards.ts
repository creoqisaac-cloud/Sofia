/**
 * Guardrails deterministas sobre la respuesta que Sofía está por enviar.
 *
 * El LLM redacta; este módulo audita. Nada comercialmente sensible sale si
 * no está respaldado por datos vigentes recuperados por el backend.
 *
 *  - Montos y porcentajes: deben existir en el contexto comercial vigente
 *    (o haberlos dicho el cliente). Los montos vencidos solo pueden
 *    mencionarse explícitamente como históricos.
 *  - "Cotización oficial": solo si existe una cotización oficial registrada.
 *  - "Mario ya revisó/aprobó": solo si Mario realmente intervino.
 *  - Disponibilidad y garantía: solo con información confirmada.
 *  - No volver a preguntar datos ya conocidos (se eliminan esas preguntas).
 *  - No pedir toda la documentación de crédito de golpe.
 *  - Las estimaciones siempre van etiquetadas como estimación.
 *  - Sofía no se hace pasar por Mario ni niega ser un asistente.
 */
import { MAX_DOCUMENT_TYPES_PER_MESSAGE, mentionedDocumentTypes } from "./documents";
import { FACT_DEFS, type FactKey } from "./facts";
import { amountsMatch, parseMoneyMentions, parsePercentMentions, percentsMatch } from "./money";
import { isQuestion, normalize, splitSentences } from "./text";

export interface GuardContext {
  /** Montos vigentes presentables (precios, bonos, cotizaciones, derivados). */
  allowedAmounts: number[];
  /** Montos de información vencida: solo mencionables como históricos. */
  historicalAmounts: number[];
  allowedPercents: number[];
  historicalPercents: number[];
  /** Montos que dijo el propio cliente (puede repetirlos). */
  customerAmounts: number[];
  /** Montos que provienen de una ESTIMACIÓN (requieren etiqueta). */
  estimateAmounts: number[];
  officialQuoteAvailable: boolean;
  /** ¿Mario realmente intervino (mensaje propio o aprobación decidida)? */
  marioEvidence: boolean;
  knownFactKeys: FactKey[];
  confirmedAvailability: boolean;
  confirmedWarranty: boolean;
}

export type GuardCode =
  | "empty_reply"
  | "invented_amount"
  | "invented_percentage"
  | "expired_as_current"
  | "false_official_claim"
  | "false_mario_claim"
  | "unverified_availability"
  | "unverified_warranty"
  | "repeated_question"
  | "document_overload"
  | "estimate_unlabeled"
  | "false_identity";

export interface GuardViolation {
  code: GuardCode;
  detail: string;
  /** fixed = corregido automáticamente; blocked = la respuesta no puede enviarse así. */
  action: "fixed" | "blocked";
}

export interface GuardReport {
  originalReply: string;
  finalReply: string;
  violations: GuardViolation[];
  blocked: boolean;
}

const HISTORICAL_MARKERS = /(vencid|ya no (esta|es|aplica|tenemos)|anterior|termino|terminaron|historic|expir|ya no vigente|no esta vigente|dejo de|estuvo|estaba|habia)/;
const ESTIMATE_MARKERS = /(estimad|estimacion|aproximad|aprox\b|aprox\.|de referencia|sujet[oa] a|por confirmar)/;
const OFFICIAL_SAFE_CONTEXT = /(\bno\b|todavia|aun\b|pedir|solicit|mario|confirm|formal|en cuanto|cuando|te la (manda|envia|pasa))/;
const MARIO_CLAIM = /(mario (ya )?(reviso|aprobo|autorizo|valido|checo|verifico|confirmo|acepto)|(ya )?lo (reviso|aprobo|autorizo|valido|checo) mario|mario (me )?(dijo|comento|indico) que|mario personalmente)/;
const AVAILABILITY_CLAIM = /((tenemos|hay|contamos con|tengo) (unidades |el |la |ese |esa )?(en )?(existencia|inventario|stock|disponib)|entrega inmediata|(esta|estan) disponibles? (para entrega|ya|hoy)|si hay (en )?(existencia|color|unidades))/;
const AVAILABILITY_SAFE_CONTEXT = /(\bno\b|verific|confirm|revis|checar|checo|pregunt|consult)/;
const WARRANTY_CLAIM = /(garantia de \d+|\d+ anos de garantia|\d[\d,.]* (km|kilometros) de garantia|garantia (es )?de \d)/;
const IDENTITY_CLAIM = /(\bsoy mario\b|habla mario|te escribe mario|no soy (un )?(bot|robot|asistente|ia|inteligencia artificial)|soy (una )?persona real|soy humano|soy humana)/;
const CONFIRMATION_QUESTION = /(confirm|sigue|sigues|seguimos|todavia|aun\b|entonces|cierto|correcto|verdad)/;

function sentenceAt(sentences: string[], raw: string): string {
  return sentences.find((s) => s.toLowerCase().includes(raw.toLowerCase())) ?? "";
}

export function guardReply(reply: string, ctx: GuardContext): GuardReport {
  const violations: GuardViolation[] = [];
  let text = reply.trim();
  if (!text) {
    return { originalReply: reply, finalReply: "", violations: [{ code: "empty_reply", detail: "Respuesta vacía.", action: "blocked" }], blocked: true };
  }

  // 1) Preguntas repetidas sobre datos ya conocidos → se eliminan.
  const sentences = splitSentences(text);
  const kept: string[] = [];
  for (const s of sentences) {
    const ns = normalize(s);
    if (isQuestion(s) && !CONFIRMATION_QUESTION.test(ns)) {
      const repeated = ctx.knownFactKeys.find((k) => FACT_DEFS[k].askPatterns.some((re) => re.test(ns)));
      if (repeated) {
        violations.push({ code: "repeated_question", detail: `Se eliminó pregunta por "${FACT_DEFS[repeated].label}" (ya se conoce).`, action: "fixed" });
        continue;
      }
    }
    kept.push(s);
  }
  if (kept.length !== sentences.length) text = kept.join(" ").trim();
  if (!text) {
    violations.push({ code: "empty_reply", detail: "La respuesta solo contenía preguntas repetidas.", action: "blocked" });
    return { originalReply: reply, finalReply: "", violations, blocked: true };
  }

  const current = splitSentences(text);
  const n = normalize(text);

  // 2) Montos
  const okAmounts = [...ctx.allowedAmounts, ...ctx.customerAmounts];
  for (const m of parseMoneyMentions(text)) {
    if (okAmounts.some((a) => amountsMatch(a, m.value))) continue;
    if (ctx.historicalAmounts.some((a) => amountsMatch(a, m.value))) {
      const sentence = normalize(sentenceAt(current, m.raw) || text);
      if (HISTORICAL_MARKERS.test(sentence)) continue;
      violations.push({ code: "expired_as_current", detail: `Monto vencido presentado como vigente: ${m.raw}`, action: "blocked" });
      continue;
    }
    violations.push({ code: "invented_amount", detail: `Monto sin respaldo vigente: ${m.raw}`, action: "blocked" });
  }

  // 3) Porcentajes
  for (const p of parsePercentMentions(text)) {
    if (ctx.allowedPercents.some((a) => percentsMatch(a, p.value))) continue;
    if (ctx.historicalPercents.some((a) => percentsMatch(a, p.value))) {
      const sentence = normalize(sentenceAt(current, p.raw) || text);
      if (HISTORICAL_MARKERS.test(sentence)) continue;
      violations.push({ code: "expired_as_current", detail: `Porcentaje vencido presentado como vigente: ${p.raw}`, action: "blocked" });
      continue;
    }
    violations.push({ code: "invented_percentage", detail: `Porcentaje sin respaldo vigente: ${p.raw}`, action: "blocked" });
  }

  // 4) Cotización oficial
  if (!ctx.officialQuoteAvailable) {
    for (const s of current) {
      const ns = normalize(s);
      if (/cotizacion(es)? oficial|precio oficial final|es oficial\b/.test(ns) && !OFFICIAL_SAFE_CONTEXT.test(ns)) {
        violations.push({ code: "false_official_claim", detail: `Se presenta como oficial sin cotización oficial registrada: "${s}"`, action: "blocked" });
      }
    }
  }

  // 5) Afirmaciones sobre acciones de Mario
  if (!ctx.marioEvidence && MARIO_CLAIM.test(n)) {
    violations.push({ code: "false_mario_claim", detail: "Afirma una acción de Mario que no ocurrió.", action: "blocked" });
  }

  // 6) Identidad
  if (IDENTITY_CLAIM.test(n)) {
    violations.push({ code: "false_identity", detail: "Sofía no puede hacerse pasar por Mario ni negar ser asistente.", action: "blocked" });
  }

  // 7) Disponibilidad y garantía
  if (!ctx.confirmedAvailability) {
    for (const s of current) {
      const ns = normalize(s);
      if (AVAILABILITY_CLAIM.test(ns) && !AVAILABILITY_SAFE_CONTEXT.test(ns)) {
        violations.push({ code: "unverified_availability", detail: `Disponibilidad no confirmada: "${s}"`, action: "blocked" });
      }
    }
  }
  if (!ctx.confirmedWarranty && WARRANTY_CLAIM.test(n)) {
    violations.push({ code: "unverified_warranty", detail: "Garantía no confirmada en la base de conocimiento.", action: "blocked" });
  }

  // 8) Documentación
  const docs = mentionedDocumentTypes(text);
  if (docs.length > MAX_DOCUMENT_TYPES_PER_MESSAGE) {
    violations.push({ code: "document_overload", detail: `Pide ${docs.length} documentos a la vez (${docs.join(", ")}).`, action: "blocked" });
  }

  // 9) Estimaciones sin etiqueta → se agrega la aclaración.
  const mentionsEstimate = parseMoneyMentions(text).some((m) => ctx.estimateAmounts.some((a) => amountsMatch(a, m.value)));
  if (mentionsEstimate && !ESTIMATE_MARKERS.test(n)) {
    text = `${text} (Es una estimación, sujeta a confirmación.)`;
    violations.push({ code: "estimate_unlabeled", detail: "Se agregó la aclaración de estimación.", action: "fixed" });
  }

  return {
    originalReply: reply,
    finalReply: text,
    violations,
    blocked: violations.some((v) => v.action === "blocked"),
  };
}
