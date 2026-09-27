/**
 * Validación de las propuestas del modelo ANTES de tocar la base de datos.
 */
import type { InfoStatus } from "@/domain/enums";
import { documentsAllowed, nextDocumentToRequest } from "@/domain/documents";
import { DOCUMENT_TYPE_LABELS } from "@/domain/enums";
import { FACT_DEFS, isFactKey, normalizeFactValue, type FactKey, type FactValue } from "@/domain/facts";
import type { GuardContext, GuardViolation } from "@/domain/guards";
import { amountsMatch, parseMoneyMentions } from "@/domain/money";
import { normalize } from "@/domain/text";
import { quoteAmounts, type RetrievedItem } from "../commercial/retrieval";
import type { AgentOutput, KnowledgeRefType } from "./output-schema";
import type { TurnScratch } from "./read-tools";
import type { TurnContext } from "./turn-context";

const PRESENTABLE: InfoStatus[] = ["confirmed", "official_quote", "validated_quote", "estimate"];

export interface AcceptedFact {
  key: FactKey;
  value: FactValue;
  valueText: string;
  evidence: string;
  confidence: string;
  sourceMessageId: string;
}

export interface RejectedProposal {
  what: string;
  value: string;
  reason: string;
}

const NUMBER_WORDS: Record<string, number> = { uno: 1, una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

function numbersIn(text: string): number[] {
  const n = normalize(text);
  const plain = [...n.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(",", ".")));
  const words = n.split(/[^a-zñ]+/).map((w) => NUMBER_WORDS[w]).filter((x): x is number => x !== undefined);
  return [...plain, ...words, ...parseMoneyMentions(text).map((m) => m.value)];
}

/**
 * Un hecho del cliente solo se acepta si está anclado a lo que el cliente
 * realmente escribió (mensaje nuevo o mensajes recientes del cliente).
 */
export function validateObservedFacts(facts: AgentOutput["observed_facts"], ctx: TurnContext): { accepted: AcceptedFact[]; rejected: RejectedProposal[] } {
  const accepted: AcceptedFact[] = [];
  const rejected: RejectedProposal[] = [];
  const customerMsgs = [
    { id: ctx.newMessage.id, body: ctx.newMessage.body },
    ...ctx.recentMessages.filter((m) => m.sender === "customer" && m.id !== ctx.newMessage.id).reverse(),
  ];

  for (const f of facts) {
    if (!isFactKey(f.key)) {
      rejected.push({ what: "fact", value: String(f.key), reason: "clave desconocida" });
      continue;
    }
    const norm = normalizeFactValue(f.key, f.value, f.numeric_value);
    if (!norm.ok) {
      rejected.push({ what: `fact:${f.key}`, value: f.value, reason: norm.reason });
      continue;
    }
    const ev = normalize(f.evidence ?? "");
    const source = customerMsgs.find((m) => ev.length >= 2 && normalize(m.body).includes(ev));
    if (!source) {
      rejected.push({ what: `fact:${f.key}`, value: f.value, reason: "sin evidencia textual en mensajes del cliente" });
      continue;
    }
    const kind = FACT_DEFS[f.key].kind;
    if ((kind === "money" || kind === "number") && typeof norm.value === "number") {
      const value = norm.value;
      const nums = numbersIn(source.body);
      const grounded = nums.some((x) => amountsMatch(x, value) || (f.key === "term_months" && amountsMatch(x * 12, value)));
      if (!grounded) {
        rejected.push({ what: `fact:${f.key}`, value: f.value, reason: "el número no aparece en lo que dijo el cliente" });
        continue;
      }
    }
    accepted.push({ key: f.key, value: norm.value, valueText: norm.valueText, evidence: f.evidence, confidence: f.confidence, sourceMessageId: source.id });
  }
  return { accepted, rejected };
}

function isCurrent(i: RetrievedItem): boolean {
  return PRESENTABLE.includes(i.status) && !i.expired;
}

export function allRetrievedItems(ctx: TurnContext, scratch: TurnScratch): RetrievedItem[] {
  const map = new Map<string, RetrievedItem>();
  for (const i of [...ctx.commercial.items, ...scratch.extraItems]) map.set(i.refId, i);
  return [...map.values()];
}

export function turnQuotes(ctx: TurnContext, scratch: TurnScratch) {
  const quotes = [...scratch.quotes];
  if (ctx.systemQuote?.computation.ok) quotes.unshift({ refId: ctx.systemQuote.refId, computation: ctx.systemQuote.computation });
  return quotes;
}

export function buildGuardContext(ctx: TurnContext, scratch: TurnScratch, acceptedFacts: AcceptedFact[]): GuardContext {
  const items = allRetrievedItems(ctx, scratch);
  const current = items.filter(isCurrent);
  const historical = items.filter((i) => !isCurrent(i));
  const quotes = turnQuotes(ctx, scratch).map((q) => quoteAmounts(q.computation));

  const customerTexts = [ctx.newMessage.body, ...ctx.recentMessages.filter((m) => m.sender === "customer").map((m) => m.body)];
  const customerAmounts = customerTexts.flatMap((t) => parseMoneyMentions(t).map((m) => m.value));
  for (const k of ["budget", "down_payment", "target_monthly_payment"] as const) {
    const v = ctx.profile[k];
    if (typeof v === "number") customerAmounts.push(v);
  }
  const knownFactKeys = new Set<FactKey>(Object.keys(ctx.profile).filter(isFactKey));
  for (const f of acceptedFacts) knownFactKeys.add(f.key);
  if (ctx.customer.nameKnown) knownFactKeys.add("name");

  return {
    allowedAmounts: [...current.flatMap((i) => i.amounts), ...quotes.flatMap((q) => q.all)],
    historicalAmounts: historical.flatMap((i) => i.amounts),
    allowedPercents: [...current.flatMap((i) => i.percents), ...quotes.flatMap((q) => q.percents)],
    historicalPercents: historical.flatMap((i) => i.percents),
    customerAmounts,
    estimateAmounts: [...current.filter((i) => i.status === "estimate").flatMap((i) => i.amounts), ...quotes.flatMap((q) => q.estimateOnly)],
    officialQuoteAvailable: ctx.officialQuoteAvailable,
    marioEvidence: ctx.marioIntervened,
    knownFactKeys: [...knownFactKeys],
    confirmedAvailability: current.some((i) => i.category === "availability" && i.status === "confirmed"),
    confirmedWarranty: current.some((i) => i.category === "warranty" && (i.status === "confirmed" || i.status === "official_quote")),
  };
}

export interface ValidatedKnowledgeRef {
  refType: KnowledgeRefType;
  refId: string;
  title: string;
  status: InfoStatus;
  statusPresented: InfoStatus;
  sourceName: string | null;
  isDemo: boolean;
  corrected: boolean;
}

/** Solo se aceptan referencias a datos realmente entregados en este turno, con su estado real. */
export function validateKnowledgeUsed(
  refs: AgentOutput["knowledge_used"],
  ctx: TurnContext,
  scratch: TurnScratch,
): { refs: ValidatedKnowledgeRef[]; rejected: RejectedProposal[] } {
  const items = new Map(allRetrievedItems(ctx, scratch).map((i) => [i.refId, i]));
  const quotes = new Map(turnQuotes(ctx, scratch).map((q) => [q.refId, q]));
  const out: ValidatedKnowledgeRef[] = [];
  const rejected: RejectedProposal[] = [];
  for (const r of refs) {
    const item = items.get(r.ref_id);
    if (item) {
      out.push({
        refType: item.refType,
        refId: item.refId,
        title: item.title,
        status: item.status,
        statusPresented: r.status_presented,
        sourceName: item.sourceName,
        isDemo: item.isDemo,
        corrected: r.status_presented !== item.status,
      });
      continue;
    }
    const q = quotes.get(r.ref_id);
    if (q) {
      const status: InfoStatus = q.computation.quote.calculationType === "validated_template" ? "validated_quote" : "estimate";
      out.push({
        refType: "quote",
        refId: q.refId,
        title: `${q.computation.quote.calculationType === "validated_template" ? "Corrida validada" : "Estimación"} ${q.computation.model} ${q.computation.version}`,
        status,
        statusPresented: r.status_presented,
        sourceName: "Motor de cotización (determinista)",
        isDemo: q.computation.isDemo,
        corrected: r.status_presented !== status,
      });
      continue;
    }
    rejected.push({ what: "knowledge_used", value: r.ref_id, reason: "referencia no entregada en el contexto del turno" });
  }
  return { refs: out, rejected };
}

/** Respuesta segura cuando la del modelo no puede enviarse. No contiene cifras. */
export function buildSafeReply(ctx: TurnContext, violations: GuardViolation[], escalating: boolean): string {
  if (violations.some((v) => v.code === "document_overload")) {
    const paymentMethod = typeof ctx.provisionalProfile.payment_method === "string" ? ctx.provisionalProfile.payment_method : undefined;
    const doc = documentsAllowed("documentation", paymentMethod) ? nextDocumentToRequest("documentation", paymentMethod, ctx.documents) : null;
    return doc
      ? `Para no llenarte de papeles vamos paso a paso: por ahora solo necesitaría tu ${DOCUMENT_TYPE_LABELS[doc]}. Lo demás te lo voy pidiendo conforme avancemos 🙌`
      : "Cuando avancemos con el crédito te voy pidiendo los documentos uno por uno, sin llenarte de papeles 🙌";
  }
  const base = "Déjame verificar ese dato con Mario para darte información correcta y te confirmo en un momento 🙌";
  if (escalating) return `${base} También le paso tu mensaje para que te atienda.`;
  const next = ctx.missingFacts[0];
  if (!next) return base;
  const q = next.question.startsWith("¿") ? `¿${next.question.charAt(1).toLowerCase()}${next.question.slice(2)}` : next.question;
  return `${base} Mientras, ${q}`;
}
