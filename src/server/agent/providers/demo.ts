/**
 * Motor DEMO determinista ("Sofía sin LLM").
 *
 * Produce exactamente el mismo contrato (AgentOutput) que el LLM, usando
 * reglas. Sirve para:
 *  - probar el sistema completo sin API ni costo,
 *  - pruebas automatizadas reproducibles.
 * Pasa por los mismos validadores y guardrails que la salida de Claude.
 */
import type { CrmStage, EscalationTrigger, InfoStatus, Temperature } from "@/domain/enums";
import { validateStageTransition } from "@/domain/crm";
import { documentsAllowed, nextDocumentToRequest } from "@/domain/documents";
import { DOCUMENT_TYPE_LABELS } from "@/domain/enums";
import { effectiveStatus } from "@/domain/knowledge";
import { formatMXN, formatPercent } from "@/domain/money";
import { pickFinancingRule } from "@/domain/quote-engine";
import { buildDeterministicSummary } from "@/domain/summary";
import type { Tag } from "@/domain/tags";
import { detectAskedFact, INTENT_LABELS } from "@/domain/intents";
import { normalize } from "@/domain/text";
import { findVehicle, findVersion } from "../../commercial/catalog";
import { pickListPrice, resolveBonusFor, toFinancingLike } from "../../commercial/quoting";
import type { AgentOutput, KnowledgeRefType, RequestedTool } from "../output-schema";
import type { TurnContext } from "../turn-context";
import type { LlmProvider, ProviderRequest, ProviderResponse } from "./types";

const ESCALATION_TEXT: Record<EscalationTrigger, string> = {
  customer_requests_mario: "Le aviso a Mario para que te contacte directamente.",
  ready_to_purchase: "¡Qué gusto! Le paso tu caso a Mario para que te confirme las condiciones finales y agenden el cierre.",
  discount_outside_rules: "Un descuento adicional no lo puedo confirmar yo; se lo consulto a Mario y te aviso.",
  special_condition: "Esa condición la tiene que revisar Mario; se la consulto y te confirmo.",
  credit_approved: "¡Felicidades! 🎉 Le aviso a Mario para confirmar con la financiera y agendar los siguientes pasos.",
  special_negotiation: "Eso lo tiene que ver Mario directamente; se lo consulto y te aviso.",
  human_judgment: "Déjame consultarlo con Mario para darte la mejor respuesta.",
  approaching_closing: "Le aviso a Mario para que te atienda personalmente en el cierre.",
};

const TEMP_RANK: Record<Temperature, number> = { cold: 0, interested: 1, hot: 2, very_hot: 3 };
const STAGE_REASON: Partial<Record<CrmStage, string>> = {
  not_interested: "El cliente dijo que ya no le interesa.",
  closing: "El cliente quiere comprar/cerrar.",
  credit: "El cliente reporta crédito aprobado.",
  negotiation: "El cliente pidió descuento o una condición especial.",
  documentation: "Inicio de documentación de crédito.",
  test_drive: "El cliente pidió prueba de manejo.",
  appointment: "Se propuso una visita a la agencia.",
  financing: "Se envió estimación de financiamiento.",
  quotation: "Se envió cotización.",
  profiling: "Inicio de perfilamiento.",
};
const COMMITMENT_RE = /(te (respeto|dejo|mando|envio|llamo|marco|veo|espero|confirmo|aparto|guardo|consigo)|queda(mos)? (en|el|que)|nos vemos|te lo (dejo|respeto|consigo))/;

function demoSuffix(isDemo: boolean, extra?: string): string {
  if (extra && isDemo) return ` (${extra}, dato DEMO)`;
  if (extra) return ` (${extra})`;
  return isDemo ? " (dato DEMO)" : "";
}

/** Estilo WhatsApp: como máximo un emoji por mensaje. */
function oneEmoji(text: string): string {
  let seen = false;
  return text
    .replace(/\s?(🙌|🎉)/gu, (m) => {
      if (seen) return "";
      seen = true;
      return m;
    })
    .replace(/\s{2,}/g, " ")
    .replace(/([^\s.!?,:;¡¿])\s+¿/g, "$1. ¿")
    .trim();
}

export function demoBrain(ctx: TurnContext): AgentOutput {
  const P = ctx.provisionalProfile;
  const intents = new Set(ctx.intents);
  const msg = normalize(ctx.newMessage.body);
  const firstName =
    typeof P.name === "string" ? P.name.split(" ")[0]! : ctx.customer.nameKnown ? ctx.customer.displayName.split(" ")[0]! : null;

  const parts: string[] = [];
  const used: AgentOutput["knowledge_used"] = [];
  const requested: RequestedTool[] = [];
  const unknownTopics = [...ctx.commercial.unknownTopics];
  const pendingNew: string[] = [];
  let asked = false;
  let quoteSent = false;
  const cite = (ref_type: KnowledgeRefType, ref_id: string, status_presented: InfoStatus) => {
    if (!used.some((u) => u.ref_id === ref_id)) used.push({ ref_type, ref_id, status_presented });
  };

  // ── Apertura ──
  const isFirstReply = !ctx.recentMessages.some((m) => m.sender === "sofia");
  const lastNonCustomer = [...ctx.recentMessages].reverse().find((m) => m.id !== ctx.newMessage.id && m.sender !== "customer");
  const resumingAfterMario = lastNonCustomer?.sender === "mario" || (lastNonCustomer?.sender === "system" && /retoma/i.test(lastNonCustomer.body));
  if (isFirstReply) parts.push(`¡Hola${firstName ? `, ${firstName}` : ""}! Soy Sofía, te escribo de parte de Mario Abarca, asesor Honda 🙌`);
  else if (resumingAfterMario) parts.push(`Retomo por aquí${firstName ? `, ${firstName}` : ""} 🙌`);
  const escalations = ctx.deterministicEscalations;
  if (!isFirstReply && !resumingAfterMario && escalations.length === 0) {
    const isQ = ctx.newMessage.body.includes("?");
    const openers = isQ ? ["Claro", "Con gusto", "Te cuento", "Mira"] : ["Perfecto", "Excelente", "Muy bien", "Va"];
    parts.push(`${openers[ctx.totalMessages % openers.length]!}${firstName ? `, ${firstName}` : ""}.`);
  }

  // ── Escalamientos deterministas ──
  for (const e of escalations) parts.push(ESCALATION_TEXT[e.trigger]);

  const notInterested = intents.has("not_interested");
  if (notInterested) parts.push("Entiendo, gracias por avisarme. Si más adelante te interesa, aquí estamos para ayudarte 🙌");

  // ── Información comercial ──
  const model = typeof P.vehicle_interest === "string" ? P.vehicle_interest : (ctx.commercial.modelsInScope[0] ?? null);
  const vehicle = findVehicle(ctx.catalog, model);
  const version = vehicle && typeof P.version === "string" ? findVersion(ctx.catalog, vehicle.id, P.version) : null;
  const paymentMethod = typeof P.payment_method === "string" ? P.payment_method : undefined;
  const wantsQuote = intents.has("ask_quote") || intents.has("ask_financing");

  if (!notInterested && ctx.systemQuote) {
    const c = ctx.systemQuote.computation;
    if (c.ok) {
      const q = c.quote;
      quoteSent = true;
      const bonusTxt = q.bonus > 0 ? `, ya con el bono de ${formatMXN(q.bonus)}` : "";
      if (q.calculationType === "validated_template") {
        parts.push(
          `Tengo una corrida validada: ${c.model} ${c.version} con ${formatMXN(q.downPayment)} de enganche a ${q.termMonths} meses queda en ${formatMXN(q.monthlyPayment!)} al mes${bonusTxt}${demoSuffix(c.isDemo, "sujeta a aprobación de crédito")}.`,
        );
        cite("quote", ctx.systemQuote.refId, "validated_quote");
      } else if (q.monthlyPayment !== null) {
        parts.push(
          `Con ${formatMXN(q.downPayment)} de enganche a ${q.termMonths} meses, el ${c.model} ${c.version} quedaría aprox. en ${formatMXN(Math.round(q.monthlyPayment))} al mes${bonusTxt}${demoSuffix(c.isDemo, "estimación sin placas, sujeta a aprobación")}.`,
        );
        cite("quote", ctx.systemQuote.refId, "estimate");
      } else {
        parts.push(
          `De contado, el ${c.model} ${c.version} quedaría en ${formatMXN(q.vehiclePrice - q.bonus)}${bonusTxt}${demoSuffix(c.isDemo, "estimación sin placas ni seguro")}.`,
        );
        cite("quote", ctx.systemQuote.refId, "estimate");
      }
    } else if (c.reason === "down_payment_below_minimum" || c.reason === "term_not_allowed") {
      parts.push(`${c.message} ¿Quieres que lo calculemos con otro monto o plazo?`);
      asked = true;
    } else if (c.reason === "down_payment_exceeds_price") {
      parts.push("Con ese monto prácticamente lo cubres de contado. ¿Te lo cotizo de contado?");
      asked = true;
    } else {
      unknownTopics.push(c.reason === "no_financing_rule" ? "condiciones de financiamiento vigentes" : `precio vigente de ${c.model} ${c.version}`);
    }
  }

  const bonusQuestion = intents.has("ask_bonus") && /enganche/.test(msg);
  if (!notInterested && vehicle && bonusQuestion) {
    // Regla crítica explicada al cliente: el bono no depende del enganche.
    const bonus = resolveBonusFor(ctx.catalog, {
      vehicleId: vehicle.id,
      versionId: version?.id ?? null,
      paymentMethod: paymentMethod === "cash" ? "cash" : paymentMethod === "financing" ? "financing" : null,
      downPayment: null,
      termMonths: null,
      vehiclePrice: null,
      now: ctx.now,
    });
    if (bonus.amount > 0 && bonus.offerId) {
      const offer = ctx.catalog.offers.find((o) => o.id === bonus.offerId)!;
      parts.push(
        `Ojo: el bono es de la promoción del ${vehicle.model}, no depende del enganche. Con más enganche baja tu mensualidad, pero el bono se mantiene en ${formatMXN(bonus.amount)}${demoSuffix(offer.isDemo)}.`,
      );
      cite("commercial_offer", bonus.offerId, bonus.status);
    }
  }
  if (!notInterested && vehicle && !quoteSent && !bonusQuestion && (intents.has("ask_price") || intents.has("ask_bonus") || (wantsQuote && !version))) {
    const versions = ctx.catalog.versions.filter((v) => v.vehicleId === vehicle.id);
    const targetVersions = version ? [version] : versions;
    const priced = targetVersions
      .map((v) => ({ v, price: pickListPrice(ctx.catalog, v.id, ctx.now) }))
      .filter((x) => x.price && effectiveStatus(x.price, ctx.now).presentableAsCurrent);
    if (priced.length > 0) {
      const anyEstimate = priced.some((x) => effectiveStatus(x.price!, ctx.now).status === "estimate");
      const isDemo = priced.some((x) => x.price!.isDemo);
      const list = priced
        .map((x) => `${version ? "" : `${x.v.name} `}${effectiveStatus(x.price!, ctx.now).status === "estimate" ? "aprox. " : ""}${formatMXN(x.price!.amount!)}`)
        .join(", ");
      parts.push(
        version
          ? `El ${vehicle.model} ${version.name} tiene precio de lista de ${list}${demoSuffix(isDemo, anyEstimate ? "precio estimado, aún sin lista oficial" : undefined)}.`
          : `El ${vehicle.model} lo tenemos en ${list}${demoSuffix(isDemo, anyEstimate ? "precios de lista; los marcados aprox. son estimados" : "precios de lista")}.`,
      );
      for (const x of priced) cite("commercial_offer", x.price!.id, effectiveStatus(x.price!, ctx.now).status);
    } else if (intents.has("ask_price")) {
      unknownTopics.push(`precio vigente del ${vehicle.model}${version ? ` ${version.name}` : ""}`);
    }

    const bonus = resolveBonusFor(ctx.catalog, {
      vehicleId: vehicle.id,
      versionId: version?.id ?? null,
      paymentMethod: paymentMethod === "cash" ? "cash" : paymentMethod === "financing" ? "financing" : null,
      downPayment: null,
      termMonths: null,
      vehiclePrice: null,
      now: ctx.now,
    });
    if (bonus.amount > 0 && bonus.offerId) {
      const offer = ctx.catalog.offers.find((o) => o.id === bonus.offerId)!;
      parts.push(`Además tiene un bono de ${formatMXN(bonus.amount)}${demoSuffix(offer.isDemo)}.`);
      cite("commercial_offer", bonus.offerId, bonus.status);
    } else if (intents.has("ask_bonus") || intents.has("ask_price")) {
      const expired = ctx.catalog.offers.find(
        (o) => o.vehicleId === vehicle.id && o.offerType === "bonus" && effectiveStatus(o, ctx.now).expired && o.amount,
      );
      if (expired) {
        parts.push(`El bono de ${formatMXN(expired.amount!)} que hubo para el ${vehicle.model} ya terminó; por ahora no tengo un bono vigente confirmado.`);
        // Ya se explicó que no hay bono vigente: no repetirlo como "tema por verificar".
        for (let i = unknownTopics.length - 1; i >= 0; i--) if (unknownTopics[i]!.startsWith("bono vigente")) unknownTopics.splice(i, 1);
        cite("commercial_offer", expired.id, "historical");
      }
    }
  }

  if (!notInterested && intents.has("ask_financing") && !quoteSent) {
    const rule = pickFinancingRule(ctx.catalog.financing.map(toFinancingLike), ctx.now);
    const row = rule ? ctx.catalog.financing.find((f) => f.id === rule.id) : null;
    if (rule && row) {
      parts.push(
        `Manejamos financiamiento con ${rule.lender} a una tasa de ${formatPercent(rule.annualRate)} anual, plazos de ${rule.allowedTerms.join(", ")} meses y enganche desde ${formatPercent(rule.minDownPaymentPct)}${demoSuffix(row.isDemo)}.`,
      );
      cite("financing_rule", rule.id, effectiveStatus(rule, ctx.now).status);
    } else {
      unknownTopics.push("condiciones de financiamiento vigentes");
    }
  }

  if (!notInterested && intents.has("ask_insurance")) {
    const ins = ctx.catalog.insurance.find((i) => effectiveStatus(i, ctx.now).presentableAsCurrent);
    if (ins && ins.pctOfVehiclePrice) {
      parts.push(`El seguro amplio con ${ins.insurer} sale aprox. en ${formatPercent(ins.pctOfVehiclePrice)} del valor del auto al año${demoSuffix(ins.isDemo, "estimación")}.`);
      cite("insurance_rule", ins.id, effectiveStatus(ins, ctx.now).status);
    }
  }

  if (!notInterested && intents.has("ask_features") && vehicle) {
    const v = version ?? ctx.catalog.versions.find((x) => x.vehicleId === vehicle.id);
    if (v && v.features.length) {
      parts.push(`El ${vehicle.model} ${v.name} trae ${v.features.join(", ")}.`);
      cite("vehicle_version", v.id, effectiveStatus(v, ctx.now).status);
    }
    const perf = ctx.commercial.items.find((i) => i.refType === "knowledge_item" && i.category === "feature" && /rendimiento/i.test(i.title));
    if (perf && /rendimiento|consum|gasolina|km/.test(msg) && perf.status === "confirmed") {
      const item = ctx.catalog.knowledge.find((k) => k.id === perf.refId);
      if (item) {
        parts.push(item.content);
        cite("knowledge_item", item.id, perf.status);
      }
    }
  }

  // ── Documentación: uno a la vez ──
  let proposedStage: CrmStage | null = null;
  if (!notInterested && intents.has("ask_documents")) {
    const stageForDocs: CrmStage = paymentMethod === "financing" ? "documentation" : ctx.crm.stage;
    const nextDoc = nextDocumentToRequest(stageForDocs, paymentMethod, ctx.documents);
    if (nextDoc && documentsAllowed(stageForDocs, paymentMethod)) {
      parts.push(`Para no llenarte de papeles vamos paso a paso: por ahora solo necesitaría tu ${DOCUMENT_TYPE_LABELS[nextDoc]}. Lo demás te lo voy pidiendo conforme avancemos 🙌`);
      requested.push({ tool: "request_document", reason: "Siguiente documento según política", arguments: { requested_window: null, document_type: nextDoc, amount: null, note: null } });
      proposedStage = "documentation";
      asked = true;
      const policy = ctx.commercial.items.find((i) => i.refType === "knowledge_item" && i.category === "policy");
      if (policy) cite("knowledge_item", policy.refId, policy.status);
    } else {
      parts.push("Cuando avancemos con el crédito te voy pidiendo los documentos uno por uno, sin llenarte de papeles 🙌");
    }
  }

  // ── Temas sin información confirmada ──
  const uniqueUnknown = Array.from(new Set(unknownTopics));
  if (!notInterested && uniqueUnknown.length) {
    parts.push(`Sobre ${uniqueUnknown.join(" y ")}, no tengo el dato confirmado; déjame verificarlo con Mario y te aviso.`);
    requested.push({ tool: "create_followup", reason: "Información no confirmada solicitada por el cliente", arguments: { requested_window: null, document_type: null, amount: null, note: `Verificar: ${uniqueUnknown.join("; ")}` } });
    pendingNew.push(...uniqueUnknown.map((t) => `Verificar con Mario: ${t}`));
  }

  // ── Prueba de manejo / cita ──
  const mentionsDay = /(lunes|martes|miercoles|jueves|viernes|sabado|domingo|manana|hoy|en la tarde|en la manana|\d{1,2}(:\d{2})?\s*(am|pm|hrs|h)\b)/.test(msg);
  if (!notInterested && (intents.has("test_drive") || (intents.has("appointment") && mentionsDay))) {
    const kind = intents.has("test_drive") ? "schedule_test_drive" : "schedule_appointment";
    if (mentionsDay) {
      parts.push(`Anotado. Lo dejo como propuesta${kind === "schedule_test_drive" ? " para tu prueba de manejo" : " para tu visita"} y Mario te confirma el horario 🙌`);
      requested.push({ tool: kind, reason: "El cliente propuso día/horario", arguments: { requested_window: ctx.newMessage.body.slice(0, 120), document_type: null, amount: null, note: null } });
    } else if (!asked) {
      parts.push(`¡Claro! Con gusto agendamos${kind === "schedule_test_drive" ? ` tu prueba de manejo${vehicle ? ` del ${vehicle.model}` : ""}` : " tu visita"}. ¿Qué día y horario te acomoda?`);
      asked = true;
    }
    proposedStage = kind === "schedule_test_drive" ? "test_drive" : "appointment";
  }

  if (!notInterested && /que (tengo que|debo|necesito) llevar|que llevo\b/.test(msg)) {
    parts.push("Le confirmo a Mario qué necesitas llevar y te aviso.");
    requested.push({ tool: "create_followup", reason: "El cliente pregunta qué llevar a su visita", arguments: { requested_window: null, document_type: null, amount: null, note: "Confirmar al cliente qué debe llevar a su visita." } });
    pendingNew.push("Confirmar qué debe llevar a su visita");
  }

  if (!notInterested && intents.has("objection") && escalations.length === 0) {
    parts.push("Te entiendo. Podemos ajustar versión, enganche o plazo para que te quede más cómodo.");
  }

  if (intents.has("discount_request")) {
    const amountAsked = ctx.provisionalFacts.find((f) => f.numericValue && f.key === "budget")?.numericValue ?? null;
    requested.push({ tool: "request_discount", reason: "El cliente pidió descuento", arguments: { requested_window: null, document_type: null, amount: amountAsked, note: ctx.newMessage.body.slice(0, 160) } });
  }
  if (intents.has("special_condition")) {
    requested.push({ tool: "request_special_condition", reason: "El cliente pidió una condición especial", arguments: { requested_window: null, document_type: null, amount: null, note: ctx.newMessage.body.slice(0, 160) } });
  }

  // ── Siguiente pregunta (una sola, nunca sobre datos conocidos) ──
  let nextQuestionLabel: string | null = null;
  // En negociación/cierre ya no se perfila: el siguiente paso lo lleva Mario.
  const lateStage = ["negotiation", "closing", "credit", "sold"].includes(ctx.crm.stage);
  if (!asked && escalations.length === 0 && !notInterested && !lateStage) {
    // No repetir la pregunta de los dos mensajes anteriores de Sofía si el cliente no la contestó.
    const recentlyAsked = new Set(
      ctx.recentMessages
        .filter((m) => m.sender === "sofia")
        .slice(-3)
        .map((m) => detectAskedFact(m.body))
        .filter(Boolean),
    );
    const candidates = ctx.missingFacts.filter((m) => !recentlyAsked.has(m.key));
    const preferred = wantsQuote ? ["version", "down_payment", "payment_method"] : [];
    const next = candidates.find((m) => preferred.includes(m.key)) ?? candidates[0];
    if (next) {
      parts.push(next.question);
      nextQuestionLabel = next.label;
      asked = true;
    }
  }

  // ── Etapa ──
  const cur = ctx.crm.stage;
  const esc = new Set(escalations.map((e) => e.trigger));
  let stage: CrmStage | null = null;
  if (notInterested) stage = "not_interested";
  else if (esc.has("ready_to_purchase")) stage = "closing";
  else if (esc.has("credit_approved")) stage = "credit";
  else if (esc.has("discount_outside_rules") || esc.has("special_condition")) stage = "negotiation";
  else if (proposedStage) stage = proposedStage;
  else if (quoteSent && paymentMethod === "financing") stage = "financing";
  else if (quoteSent) stage = "quotation";
  else if (cur === "new" || cur === "follow_up" || cur === "not_interested") stage = "profiling";
  if (stage && (stage === cur || !validateStageTransition(cur, stage, "sofia").ok)) stage = null;

  // ── Temperatura ──
  let temp: Temperature | null = null;
  const timing = typeof P.purchase_timing === "string" ? P.purchase_timing : null;
  if (notInterested) temp = "cold";
  else if (esc.has("ready_to_purchase") || esc.has("credit_approved")) temp = "very_hot";
  else if (intents.has("test_drive") || (intents.has("appointment") && mentionsDay) || timing === "immediate" || timing === "this_month" || quoteSent) temp = "hot";
  else if (model || intents.has("ask_price") || intents.has("ask_financing")) temp = "interested";
  if (temp && !(notInterested || TEMP_RANK[temp] > TEMP_RANK[ctx.crm.temperature])) temp = null;

  // ── Etiquetas ──
  const tags = new Set<Tag>();
  const list = (k: keyof typeof P) => (Array.isArray(P[k]) ? (P[k] as string[]) : []);
  if (list("usage_type").includes("family")) tags.add("uso_familiar");
  if (list("usage_type").includes("work")) tags.add("uso_trabajo");
  if (list("usage_type").includes("rideshare")) tags.add("plataforma_digital");
  if (P.powertrain_preference === "hybrid") tags.add("interes_hibrido");
  if (P.fuel_economy_importance === "high") tags.add("prioriza_rendimiento");
  if (paymentMethod === "cash") tags.add("pago_contado");
  if (paymentMethod === "financing") tags.add("pago_financiado");
  if (list("objections").includes("precio")) tags.add("sensible_precio");
  if (list("objections").includes("mensualidad")) tags.add("sensible_mensualidad");
  if (list("competitors").length) tags.add("compara_competencia");
  if (timing === "immediate") tags.add("compra_inmediata");
  if (timing === "this_month") tags.add("compra_este_mes");
  if (timing === "exploring") tags.add("explorando");
  if (intents.has("test_drive")) tags.add("pidio_prueba_manejo");
  if (/a cuenta/.test(msg)) tags.add("auto_a_cuenta");
  if (cur === "not_interested" || cur === "follow_up") tags.add("reactivado");
  const tagsProposed = [...tags].filter((t) => !ctx.tags.includes(t)).map((tag) => ({ tag, reason: "Derivado del perfil/mensaje del cliente" }));

  // ── Compromisos de Mario (solo de sus propios mensajes) ──
  const known = new Set((ctx.summary?.commitments ?? []).map((c) => c.sourceMessageId));
  const commitments = ctx.recentMessages
    .filter((m) => m.sender === "mario" && !known.has(m.id) && COMMITMENT_RE.test(normalize(m.body)))
    .map((m) => ({ text: m.body.slice(0, 200), source_message_id: m.id }));

  // ── Próxima acción ──
  const firstEsc = escalations[0];
  const nextAction: AgentOutput["next_action"] = firstEsc
    ? { type: "escalate_to_mario", description: firstEsc.recommendedNextStep }
    : requested.some((r) => r.tool === "schedule_test_drive")
      ? { type: "schedule_test_drive", description: "Mario confirma horario de la prueba de manejo." }
      : requested.some((r) => r.tool === "request_document")
        ? { type: "request_document", description: "Esperar el documento solicitado." }
        : quoteSent
          ? { type: "send_quote", description: "Dar seguimiento a la estimación enviada y resolver dudas." }
          : nextQuestionLabel
            ? { type: "ask_question", description: `Obtener: ${nextQuestionLabel}` }
            : { type: "wait_customer", description: "Esperar respuesta del cliente." };

  const stageAfter = stage ?? cur;
  const tempAfter = temp ?? ctx.crm.temperature;
  const prevPending = (ctx.summary?.pendingItems ?? []).filter((p) => !/^Obtener /.test(p));
  const pending = Array.from(new Set([...prevPending, ...pendingNew, ...(nextQuestionLabel ? [`Obtener ${nextQuestionLabel.toLowerCase()}`] : [])])).slice(0, 6);

  return {
    customer_reply: oneEmoji(parts.join(" ")),
    observed_facts: ctx.provisionalFacts.map((f) => ({
      key: f.key,
      value: f.value,
      numeric_value: f.numericValue,
      evidence: f.evidence,
      confidence: f.confidence,
    })),
    tags_proposed: tagsProposed,
    stage_proposal: stage ? { stage, reason: STAGE_REASON[stage] ?? "Avance de la conversación." } : null,
    temperature_proposal: temp
      ? { temperature: temp, reason: `El cliente ${[...intents].map((i) => INTENT_LABELS[i]).join(", ") || "muestra interés en un modelo"}.` }
      : null,
    next_action: nextAction,
    requires_mario: escalations.length > 0,
    escalation_reason: firstEsc ? { trigger: firstEsc.trigger, explanation: firstEsc.reason, recommended_next_step: firstEsc.recommendedNextStep } : null,
    requires_approval: requested.some((r) => ["request_discount", "request_special_condition", "modify_price", "send_document"].includes(r.tool)),
    requested_tools: requested,
    knowledge_used: used,
    summary_update: buildDeterministicSummary(ctx.customer.displayName, P, stageAfter, tempAfter),
    pending_items: pending,
    mario_commitments_observed: commitments,
  };
}

export class DemoProvider implements LlmProvider {
  readonly name = "demo" as const;
  readonly model = "sofia-demo-rules";
  readonly supportsCorrection = false;

  async generate({ ctx }: ProviderRequest): Promise<ProviderResponse> {
    return { raw: demoBrain(ctx), model: this.model };
  }
}
