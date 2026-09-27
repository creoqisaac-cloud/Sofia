/**
 * Capas dinámicas del prompt, construidas por conversación y por turno.
 * Nunca incluyen contenido de documentos sensibles: solo su estado.
 */
import { CRM_STAGE_LABELS, DOCUMENT_TYPE_LABELS, TEMPERATURE_LABELS } from "@/domain/enums";
import { FACT_DEFS } from "@/domain/facts";
import { TAG_CATALOG } from "@/domain/tags";
import { truncate } from "@/domain/text";
import { describeQuote } from "../../commercial/retrieval";
import type { TurnContext } from "../turn-context";

const SENDER_LABEL = { customer: "CLIENTE", sofia: "SOFÍA", mario: "MARIO", system: "SISTEMA" } as const;

/** Capa 7 — Contexto del cliente (perfil estructurado + CRM). */
export function renderCustomerContext(ctx: TurnContext): string {
  const known = ctx.knownFacts.length
    ? ctx.knownFacts.map((f) => `- ${f.label}: ${f.value}`).join("\n")
    : "- (aún no hay datos)";
  const detected = ctx.provisionalFacts.length
    ? ctx.provisionalFacts.map((f) => `- ${FACT_DEFS[f.key].label}: ${f.value} (evidencia: "${f.evidence}")`).join("\n")
    : "- (nada detectado automáticamente)";
  const missing = ctx.missingFacts.length
    ? ctx.missingFacts.slice(0, 5).map((m, i) => `${i + 1}. ${m.label} — sugerencia: "${m.question}"`).join("\n")
    : "- (perfil suficiente para avanzar)";
  const docs = ctx.documents.length
    ? ctx.documents.map((d) => `- ${DOCUMENT_TYPE_LABELS[d.docType]}: ${d.status}`).join("\n")
    : "- (ninguno solicitado)";
  return `<customer_context>
Cliente: ${ctx.customer.displayName}
Etapa CRM: ${ctx.crm.stage} (${CRM_STAGE_LABELS[ctx.crm.stage]}) · Temperatura: ${ctx.crm.temperature} (${TEMPERATURE_LABELS[ctx.crm.temperature]})
Etiquetas actuales: ${ctx.tags.length ? ctx.tags.join(", ") : "(ninguna)"}

Datos conocidos (NO volver a preguntarlos):
${known}

Detectado automáticamente en el mensaje nuevo (confírmalo en observed_facts solo si el cliente realmente lo dijo):
${detected}

Datos útiles faltantes (en orden; pregunta como máximo uno):
${missing}

Documentos (solo estado; el contenido nunca se comparte aquí):
${docs}

Catálogo de etiquetas permitidas: ${Object.keys(TAG_CATALOG).join(", ")}
</customer_context>`;
}

/** Memoria de largo plazo: resumen, compromisos de Mario, pendientes, alertas. */
export function renderMemory(ctx: TurnContext): string {
  const summary = ctx.summary?.text ?? "(sin resumen todavía)";
  const commitments = ctx.summary?.commitments.filter((c) => c.status === "open") ?? [];
  const pending = ctx.summary?.pendingItems ?? [];
  const approvals = ctx.approvals.length
    ? ctx.approvals.map((a) => `- ${a.actionType}: ${a.status}${a.decisionNotes ? ` (nota de Mario: ${truncate(a.decisionNotes, 160)})` : ""}`).join("\n")
    : "- (ninguna)";
  return `<memory>
Resumen acumulado (v${ctx.summary?.version ?? 0}): ${summary}

Compromisos realizados por Mario:
${commitments.length ? commitments.map((c) => `- ${c.text}`).join("\n") : "- (ninguno)"}

Pendientes:
${pending.length ? pending.map((p) => `- ${p}`).join("\n") : "- (ninguno)"}

Solicitudes de aprobación:
${approvals}
Alertas abiertas para Mario: ${ctx.openAlerts.length ? ctx.openAlerts.map((a) => a.trigger).join(", ") : "(ninguna)"}
Mario ha intervenido en esta conversación: ${ctx.marioIntervened ? "sí" : "no"}
Última cotización registrada: ${
    ctx.latestQuote
      ? `${ctx.latestQuote.calculationType} ${ctx.latestQuote.model ?? ""} ${ctx.latestQuote.version ?? ""}${ctx.latestQuote.monthlyPayment ? ` mensualidad ${ctx.latestQuote.monthlyPayment}` : ""}`
      : "(ninguna)"
  }
Cotización oficial vigente registrada por Mario: ${ctx.officialQuoteAvailable ? "sí" : "no"}
</memory>`;
}

/** Capas 8 y 9 — Contexto comercial + conocimiento recuperado para esta consulta. */
export function renderCommercialContext(ctx: TurnContext): string {
  const lines = ctx.commercial.items.map((i) => `- ${i.line}`);
  let quote = "(el sistema no calculó cotización en este turno)";
  if (ctx.systemQuote) {
    quote = ctx.systemQuote.computation.ok
      ? describeQuote(ctx.systemQuote.computation, ctx.systemQuote.refId)
      : `No se pudo calcular (${ctx.systemQuote.computation.reason}): ${ctx.systemQuote.computation.message}`;
  }
  return `<commercial_context>
Fecha actual: ${ctx.now.toISOString().slice(0, 10)}
Modelos en alcance: ${ctx.commercial.modelsInScope.join(", ") || "(ninguno todavía)"}
Catálogo disponible: ${ctx.commercial.catalogOverview.join(" | ")}

Información recuperada (con estado efectivo, fuente y vigencia):
${lines.length ? lines.join("\n") : "- (nada específico recuperado)"}

Cotización calculada por el sistema:
${quote}

Temas SIN información confirmada (no afirmar; ofrecer verificar): ${ctx.commercial.unknownTopics.join("; ") || "(ninguno)"}
</commercial_context>`;
}

export function renderConversation(ctx: TurnContext): string {
  const earlier = ctx.totalMessages - ctx.recentMessages.length;
  const history = ctx.recentMessages
    .filter((m) => m.id !== ctx.newMessage.id)
    .map((m) => `[${m.id}] ${SENDER_LABEL[m.sender]}: ${m.body}`)
    .join("\n");
  return `<recent_messages omitted_earlier="${Math.max(0, earlier)}">
${history || "(inicio de la conversación)"}
</recent_messages>

<turn_signals>
Intenciones detectadas: ${ctx.intents.join(", ") || "(ninguna)"}
Escalamientos detectados por reglas: ${ctx.deterministicEscalations.map((e) => e.trigger).join(", ") || "(ninguno)"}
</turn_signals>

<new_message id="${ctx.newMessage.id}">
${ctx.newMessage.body}
</new_message>`;
}
