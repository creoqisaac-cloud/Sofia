/**
 * Aplicación de efectos de un turno. Todo lo que cambia en la BD pasa por
 * aquí, dentro de una transacción, después de validar:
 *   hechos (anclados) → perfil · etapa/temperatura (reglas de transición)
 *   etiquetas (catálogo) · cotizaciones (motor) · acciones (política)
 *   aprobaciones · alertas "MARIO, ENTRA TÚ" · resumen/compromisos · auditoría
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { classifyAction } from "@/domain/approvals";
import { validateStageTransition, validateTemperatureChange } from "@/domain/crm";
import { MAX_DOCUMENT_REQUESTS_PER_TURN, nextDocumentToRequest, documentsAllowed } from "@/domain/documents";
import {
  DOCUMENT_TYPES,
  QUOTE_CALCULATION_LABELS,
  type ActionTool,
  type ActorType,
  type ApprovalActionType,
  type CrmStage,
  type DocumentType,
  type EscalationTrigger,
  type Temperature,
} from "@/domain/enums";
import { FACT_DEFS, formatFactValue, mergeProfile, type CustomerProfile, type FactChange } from "@/domain/facts";
import { decideIncoming } from "@/domain/provenance";
import { rebuildProfile } from "../services/profile";
import { amountsMatch, formatMXN, parseMoneyMentions } from "@/domain/money";
import { buildDeterministicSummary } from "@/domain/summary";
import { isKnownTag, type Tag } from "@/domain/tags";
import { truncate } from "@/domain/text";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import type { AgentOutput } from "./output-schema";
import type { TurnScratch } from "./read-tools";
import type { TurnContext } from "./turn-context";
import { turnQuotes, type AcceptedFact, type RejectedProposal, type ValidatedKnowledgeRef } from "./validation";

export interface AppliedEffects {
  facts: { changes: Array<{ key: string; action: FactChange["action"] | "conflict"; previous: string | null; next: string | null }>; rejected: RejectedProposal[] };
  crm: {
    stageFrom: CrmStage;
    stageTo: CrmStage;
    temperatureFrom: Temperature;
    temperatureTo: Temperature;
    changed: boolean;
    reason: string | null;
    rejected: RejectedProposal[];
  };
  tags: { added: string[]; rejected: RejectedProposal[] };
  alerts: Array<{ id: string; trigger: EscalationTrigger; deduplicated: boolean }>;
  approvals: Array<{ id: string; actionType: ApprovalActionType; tool: ActionTool | null }>;
  actions: Array<{ tool: ActionTool; decision: "executed" | "approval_requested" | "rejected"; entityId?: string; reason: string }>;
  quotes: Array<{ id: string; calculationType: string; status: string; monthlyPayment: number | null }>;
  summaryVersion: number | null;
  commitmentsAdded: string[];
}

const TRIGGER_TAGS: Partial<Record<EscalationTrigger, Tag>> = {
  customer_requests_mario: "pidio_mario",
  discount_outside_rules: "pidio_descuento",
  special_condition: "pidio_condicion_especial",
  credit_approved: "credito_aprobado",
  ready_to_purchase: "listo_para_cerrar",
};

export interface EffectsInput {
  tx: Db;
  workspaceId: string;
  ctx: TurnContext;
  output: AgentOutput | null;
  acceptedFacts: AcceptedFact[];
  rejectedFacts: RejectedProposal[];
  finalReply: string;
  knowledgeRefs: ValidatedKnowledgeRef[];
  scratch: TurnScratch;
  runId: string;
  replyMessageId: string;
  guardBlocked: boolean;
  guardCodes: string[];
}

async function audit(tx: Db, workspaceId: string, customerId: string, actorType: ActorType, eventType: string, entityType: string | null, entityId: string | null, data: Record<string, unknown>) {
  await tx.insert(s.auditEvents).values({ workspaceId, customerId, actorType, eventType, entityType, entityId, data });
}

// ─────────────── hechos → perfil ───────────────

async function persistFacts(input: EffectsInput): Promise<{ profile: CustomerProfile; changes: AppliedEffects["facts"]["changes"] }> {
  const { tx, ctx, workspaceId, runId } = input;
  const out: AppliedEffects["facts"]["changes"] = [];

  // Sprint 2: lo que dice el cliente nunca pisa un dato CONFIRMADO por Mario ni un conflicto abierto:
  // se registra como candidato en conflicto para que Mario decida.
  const singleValued = input.acceptedFacts.filter((f) => FACT_DEFS[f.key].kind !== "list");
  const existingRows = singleValued.length
    ? await tx
        .select()
        .from(s.customerFacts)
        .where(and(eq(s.customerFacts.customerId, ctx.customerId), inArray(s.customerFacts.factKey, singleValued.map((f) => f.key))))
    : [];
  const diverted = new Set<string>();
  for (const f of singleValued) {
    const rows = existingRows.filter((r) => r.factKey === f.key);
    if (!rows.some((r) => r.status === "confirmed" || r.status === "conflicting")) continue;
    const decision = decideIncoming(rows, { value: f.value, sourceType: "customer_message" });
    diverted.add(f.key);
    if (decision.action !== "conflict") continue;
    await tx.insert(s.customerFacts).values({
      workspaceId,
      customerId: ctx.customerId,
      factKey: f.key,
      value: f.value,
      valueText: f.valueText,
      confidence: f.confidence,
      source: "customer_message",
      sourceMessageId: f.sourceMessageId,
      sourceLabel: "Conversación",
      evidence: truncate(f.evidence, 200),
      status: "conflicting",
      agentRunId: runId,
    });
    if (decision.markConflicting.length) {
      await tx.update(s.customerFacts).set({ status: "conflicting" }).where(inArray(s.customerFacts.id, decision.markConflicting));
    }
    out.push({ key: f.key, action: "conflict", previous: null, next: null });
  }
  const acceptedFacts = input.acceptedFacts.filter((f) => !diverted.has(f.key));

  const { changes } = mergeProfile(
    ctx.profile,
    acceptedFacts.map((f) => ({ key: f.key, value: f.value })),
  );
  for (const change of changes) {
    if (change.action === "reinforced") continue;
    const fact = acceptedFacts.find((f) => f.key === change.key);
    if (change.action === "retracted_dependency") {
      await tx
        .update(s.customerFacts)
        .set({ status: "retracted" })
        .where(and(eq(s.customerFacts.customerId, ctx.customerId), eq(s.customerFacts.factKey, change.key), eq(s.customerFacts.status, "observed")));
    } else if (fact) {
      const previousActive =
        change.action === "superseded"
          ? await tx
              .select({ id: s.customerFacts.id })
              .from(s.customerFacts)
              .where(and(eq(s.customerFacts.customerId, ctx.customerId), eq(s.customerFacts.factKey, change.key), eq(s.customerFacts.status, "observed")))
          : [];
      const [row] = await tx
        .insert(s.customerFacts)
        .values({
          workspaceId,
          customerId: ctx.customerId,
          factKey: change.key,
          value: change.action === "list_extended" ? change.next : fact.value,
          valueText: change.next !== undefined ? formatFactValue(change.key, change.next) : fact.valueText,
          confidence: fact.confidence,
          source: "customer_message",
          sourceMessageId: fact.sourceMessageId,
          sourceLabel: "Conversación",
          evidence: truncate(fact.evidence, 200),
          agentRunId: runId,
        })
        .returning({ id: s.customerFacts.id });
      if (change.action === "superseded" || change.action === "list_extended") {
        const ids = previousActive.map((p) => p.id);
        const listPrev =
          change.action === "list_extended"
            ? await tx
                .select({ id: s.customerFacts.id })
                .from(s.customerFacts)
                .where(and(eq(s.customerFacts.customerId, ctx.customerId), eq(s.customerFacts.factKey, change.key), eq(s.customerFacts.status, "observed")))
            : [];
        const toSupersede = [...ids, ...listPrev.map((p) => p.id)].filter((id) => id !== row!.id);
        if (toSupersede.length) {
          await tx.update(s.customerFacts).set({ status: "superseded", supersededBy: row!.id }).where(inArray(s.customerFacts.id, toSupersede));
        }
      }
    }
    out.push({
      key: change.key,
      action: change.action,
      previous: change.previous !== undefined ? formatFactValue(change.key, change.previous) : null,
      next: change.next !== undefined ? formatFactValue(change.key, change.next) : null,
    });
  }
  // La proyección se recalcula desde la bitácora (excluye campos en conflicto).
  const profile = out.length ? ((await rebuildProfile(tx, workspaceId, ctx.customerId)) as CustomerProfile) : ctx.profile;
  return { profile, changes: out };
}

// ─────────────── CRM ───────────────

export async function writeCrmState(
  tx: Db,
  args: { workspaceId: string; customerId: string; from: { stage: CrmStage; temperature: Temperature } | null; to: { stage: CrmStage; temperature: Temperature }; reason: string; changedBy: ActorType; runId?: string | null },
) {
  await tx
    .update(s.crmStates)
    .set({ isCurrent: false })
    .where(and(eq(s.crmStates.customerId, args.customerId), eq(s.crmStates.isCurrent, true)));
  await tx.insert(s.crmStates).values({
    workspaceId: args.workspaceId,
    customerId: args.customerId,
    stage: args.to.stage,
    temperature: args.to.temperature,
    previousStage: args.from?.stage ?? null,
    previousTemperature: args.from?.temperature ?? null,
    reason: args.reason,
    changedBy: args.changedBy,
    agentRunId: args.runId ?? null,
    isCurrent: true,
  });
}

async function applyCrm(input: EffectsInput, escalations: EscalationTrigger[]): Promise<AppliedEffects["crm"]> {
  const { tx, ctx, output, workspaceId, runId } = input;
  const rejected: RejectedProposal[] = [];
  let stage = ctx.crm.stage;
  let temperature = ctx.crm.temperature;
  const reasons: string[] = [];

  const stageProposal = output?.stage_proposal ?? null;
  if (stageProposal) {
    const check = validateStageTransition(ctx.crm.stage, stageProposal.stage, "sofia");
    if (check.ok && !check.noop) {
      stage = stageProposal.stage;
      reasons.push(`Etapa: ${stageProposal.reason}`);
    } else if (!check.ok) {
      rejected.push({ what: "stage", value: stageProposal.stage, reason: check.reason });
    }
  }
  // Piso determinista: el primer contacto siempre pasa a perfilamiento.
  if (stage === "new") {
    stage = "profiling";
    reasons.push("Etapa: primer contacto con el cliente.");
  }
  let tempProposal = output?.temperature_proposal ?? null;
  if (escalations.includes("ready_to_purchase") || escalations.includes("credit_approved")) {
    if (temperature !== "very_hot" && tempProposal?.temperature !== "very_hot") {
      tempProposal = { temperature: "very_hot", reason: "Señal de cierre detectada por reglas." };
    }
  }
  if (tempProposal) {
    const check = validateTemperatureChange(ctx.crm.temperature, tempProposal.temperature, tempProposal.reason);
    if (check.ok && !check.noop) {
      temperature = tempProposal.temperature;
      reasons.push(`Temperatura: ${tempProposal.reason}`);
    } else if (!check.ok) {
      rejected.push({ what: "temperature", value: tempProposal.temperature, reason: check.reason });
    }
  }
  const changed = stage !== ctx.crm.stage || temperature !== ctx.crm.temperature;
  if (changed) {
    await writeCrmState(tx, {
      workspaceId,
      customerId: ctx.customerId,
      from: { stage: ctx.crm.stage, temperature: ctx.crm.temperature },
      to: { stage, temperature },
      reason: truncate(reasons.join(" · "), 500),
      changedBy: "sofia",
      runId,
    });
  }
  for (const r of rejected) {
    await audit(tx, workspaceId, ctx.customerId, "system", "crm_proposal_rejected", "crm_state", null, { field: r.what, proposed: r.value, reason: r.reason, agentRunId: runId });
  }
  return {
    stageFrom: ctx.crm.stage,
    stageTo: stage,
    temperatureFrom: ctx.crm.temperature,
    temperatureTo: temperature,
    changed,
    reason: changed ? reasons.join(" · ") : null,
    rejected,
  };
}

// ─────────────── etiquetas ───────────────

async function applyTags(input: EffectsInput, escalations: EscalationTrigger[]): Promise<AppliedEffects["tags"]> {
  const { tx, ctx, output, workspaceId, runId } = input;
  const added: string[] = [];
  const rejected: RejectedProposal[] = [];
  const proposals: Array<{ tag: string; reason: string; source: ActorType }> = [
    ...(output?.tags_proposed ?? []).map((t) => ({ ...t, source: "sofia" as const })),
    ...escalations.map((e) => TRIGGER_TAGS[e]).filter((t): t is Tag => Boolean(t)).map((tag) => ({ tag, reason: "Disparador de escalamiento", source: "system" as const })),
  ];
  for (const p of proposals) {
    if (!isKnownTag(p.tag)) {
      rejected.push({ what: "tag", value: p.tag, reason: "etiqueta fuera del catálogo" });
      continue;
    }
    if (ctx.tags.includes(p.tag) || added.includes(p.tag)) continue;
    await tx.insert(s.customerTags).values({ workspaceId, customerId: ctx.customerId, tag: p.tag, source: p.source, reason: truncate(p.reason, 200), agentRunId: runId });
    added.push(p.tag);
  }
  return { added, rejected };
}

// ─────────────── cotizaciones ───────────────

async function persistQuotes(input: EffectsInput): Promise<AppliedEffects["quotes"]> {
  const { tx, ctx, scratch, finalReply, knowledgeRefs, workspaceId, runId } = input;
  const out: AppliedEffects["quotes"] = [];
  const replyAmounts = parseMoneyMentions(finalReply).map((m) => m.value);
  for (const { refId, computation } of turnQuotes(ctx, scratch)) {
    const q = computation.quote;
    const mentioned =
      knowledgeRefs.some((r) => r.refId === refId) ||
      (q.monthlyPayment !== null && replyAmounts.some((a) => amountsMatch(a, q.monthlyPayment!))) ||
      (q.monthlyPayment === null && replyAmounts.some((a) => amountsMatch(a, q.vehiclePrice - q.bonus)));
    const status = input.guardBlocked ? "draft" : mentioned ? "presented" : "draft";
    if (status === "presented") {
      await tx
        .update(s.quotes)
        .set({ status: "superseded" })
        .where(and(eq(s.quotes.customerId, ctx.customerId), eq(s.quotes.versionId, computation.versionId), eq(s.quotes.status, "presented")));
    }
    await tx.insert(s.quotes).values({
      id: refId,
      workspaceId,
      customerId: ctx.customerId,
      conversationId: ctx.conversationId,
      vehicleId: computation.vehicleId,
      versionId: computation.versionId,
      calculationType: q.calculationType,
      status,
      vehiclePrice: q.vehiclePrice,
      downPayment: q.downPayment,
      termMonths: q.termMonths,
      monthlyPayment: q.monthlyPayment,
      annualRate: q.annualRate,
      bonus: q.bonus,
      bonusOfferId: q.bonusOfferId,
      openingCommission: q.openingCommission,
      insurance: q.insurance,
      plates: q.plates,
      otherConcepts: q.otherConcepts,
      conditions: q.conditions,
      validUntil: q.validUntil,
      templateId: q.templateId,
      financingRuleId: q.financingRuleId,
      calculationTrace: q.trace,
      createdBy: "sofia",
      agentRunId: runId,
      isDemo: computation.isDemo,
    });
    out.push({ id: refId, calculationType: q.calculationType, status, monthlyPayment: q.monthlyPayment });
  }
  return out;
}

// ─────────────── acciones y aprobaciones ───────────────

async function handleActions(
  input: EffectsInput,
  stageAfter: CrmStage,
  profileAfter: CustomerProfile,
): Promise<{ actions: AppliedEffects["actions"]; approvals: AppliedEffects["approvals"]; policyEscalations: EscalationTrigger[] }> {
  const { tx, ctx, output, workspaceId, runId } = input;
  const actions: AppliedEffects["actions"] = [];
  const approvals: AppliedEffects["approvals"] = [];
  const policyEscalations: EscalationTrigger[] = [];
  let docsRequested = 0;
  const pendingApprovals = await tx
    .select({ actionType: s.approvalRequests.actionType })
    .from(s.approvalRequests)
    .where(and(eq(s.approvalRequests.customerId, ctx.customerId), eq(s.approvalRequests.status, "pending")));

  const requestApproval = async (actionType: ApprovalActionType, tool: ActionTool | null, reason: string, payload: Record<string, unknown>) => {
    if (pendingApprovals.some((p) => p.actionType === actionType) || approvals.some((a) => a.actionType === actionType)) return null;
    const [row] = await tx
      .insert(s.approvalRequests)
      .values({ workspaceId, customerId: ctx.customerId, conversationId: ctx.conversationId, agentRunId: runId, actionType, requestedTool: tool, payload, reason: truncate(reason, 500), requestedBy: "sofia" })
      .returning({ id: s.approvalRequests.id });
    approvals.push({ id: row!.id, actionType, tool });
    return row!.id;
  };

  for (const req of output?.requested_tools ?? []) {
    const policy = classifyAction(req.tool);
    if (policy.decision === "approval") {
      const id = await requestApproval(policy.approvalType, req.tool, req.reason || policy.reason, {
        requestedWindow: req.arguments.requested_window,
        documentType: req.arguments.document_type,
        amount: req.arguments.amount,
        note: req.arguments.note ? truncate(req.arguments.note, 300) : null,
      });
      if (policy.escalation) policyEscalations.push(policy.escalation);
      actions.push({ tool: req.tool, decision: "approval_requested", entityId: id ?? undefined, reason: policy.reason });
      continue;
    }
    if (policy.decision === "reject") {
      actions.push({ tool: req.tool, decision: "rejected", reason: policy.reason });
      continue;
    }
    switch (req.tool) {
      case "schedule_appointment":
      case "schedule_test_drive": {
        const [row] = await tx
          .insert(s.appointments)
          .values({
            workspaceId,
            customerId: ctx.customerId,
            conversationId: ctx.conversationId,
            kind: req.tool === "schedule_test_drive" ? "test_drive" : "visit",
            requestedWindow: req.arguments.requested_window ? truncate(req.arguments.requested_window, 160) : null,
            status: "scheduled",
            notes: req.reason ? truncate(req.reason, 300) : null,
            createdBy: "sofia",
          })
          .returning({ id: s.appointments.id });
        actions.push({ tool: req.tool, decision: "executed", entityId: row!.id, reason: "Cita registrada como propuesta; Mario confirma." });
        break;
      }
      case "create_followup": {
        const [row] = await tx
          .insert(s.followups)
          .values({ workspaceId, customerId: ctx.customerId, conversationId: ctx.conversationId, reason: truncate(req.arguments.note ?? req.reason, 300), createdBy: "sofia" })
          .returning({ id: s.followups.id });
        actions.push({ tool: req.tool, decision: "executed", entityId: row!.id, reason: "Seguimiento creado." });
        break;
      }
      case "request_document": {
        const payment = typeof profileAfter.payment_method === "string" ? profileAfter.payment_method : undefined;
        const allowedDoc = nextDocumentToRequest(stageAfter, payment, ctx.documents);
        const asked = (DOCUMENT_TYPES as readonly string[]).includes(req.arguments.document_type ?? "") ? (req.arguments.document_type as DocumentType) : allowedDoc;
        if (!documentsAllowed(stageAfter, payment)) {
          actions.push({ tool: req.tool, decision: "rejected", reason: "Aún no corresponde pedir documentos en esta etapa." });
        } else if (docsRequested >= MAX_DOCUMENT_REQUESTS_PER_TURN) {
          actions.push({ tool: req.tool, decision: "rejected", reason: "Solo se pide un documento por turno." });
        } else if (!asked || ctx.documents.some((d) => d.docType === asked && d.status !== "rejected")) {
          actions.push({ tool: req.tool, decision: "rejected", reason: "Documento ya solicitado o no aplicable." });
        } else {
          const [row] = await tx
            .insert(s.documents)
            .values({ workspaceId, customerId: ctx.customerId, docType: asked, status: "requested", isSensitive: asked !== "quote_pdf", requestedAt: ctx.now })
            .returning({ id: s.documents.id });
          docsRequested++;
          actions.push({ tool: req.tool, decision: "executed", entityId: row!.id, reason: `Documento solicitado: ${asked}.` });
        }
        break;
      }
      default:
        actions.push({ tool: req.tool, decision: "rejected", reason: "Acción no soportada." });
    }
  }

  // El modelo marcó requires_approval sin una acción concreta → aprobación genérica.
  if (output?.requires_approval && approvals.length === 0 && !(output.requested_tools ?? []).some((t) => classifyAction(t.tool).decision === "approval")) {
    await requestApproval("outside_commercial_rules", null, output.next_action.description || "Sofía solicita criterio de Mario.", {});
  }
  return { actions, approvals, policyEscalations };
}

// ─────────────── alertas ───────────────

function creditStatus(tags: string[], stage: CrmStage): string {
  if (tags.includes("credito_aprobado")) return "Aprobado (reportado por el cliente; confirmar con la financiera)";
  if (tags.includes("credito_en_proceso") || stage === "application" || stage === "credit") return "En proceso";
  if (stage === "documentation") return "Integrando documentación";
  return "Sin solicitud";
}

async function createAlerts(
  input: EffectsInput,
  triggers: Array<{ trigger: EscalationTrigger; reason: string; nextStep: string }>,
  state: { profile: CustomerProfile; stage: CrmStage; temperature: Temperature; tags: string[]; summary: string; quotes: AppliedEffects["quotes"] },
): Promise<AppliedEffects["alerts"]> {
  const { tx, ctx, workspaceId, runId } = input;
  const out: AppliedEffects["alerts"] = [];
  if (triggers.length === 0) return out;
  const open = await tx
    .select({ id: s.marioAlerts.id, trigger: s.marioAlerts.trigger })
    .from(s.marioAlerts)
    .where(and(eq(s.marioAlerts.customerId, ctx.customerId), inArray(s.marioAlerts.status, ["open", "acknowledged"])));

  const p = state.profile;
  const lastQuote = state.quotes.find((q) => q.status === "presented") ?? state.quotes[0];
  const quoteStatus = lastQuote
    ? `${QUOTE_CALCULATION_LABELS[lastQuote.calculationType as keyof typeof QUOTE_CALCULATION_LABELS]}${lastQuote.monthlyPayment ? ` · ${formatMXN(lastQuote.monthlyPayment)}/mes` : ""}`
    : ctx.latestQuote
      ? `${QUOTE_CALCULATION_LABELS[ctx.latestQuote.calculationType as keyof typeof QUOTE_CALCULATION_LABELS] ?? ctx.latestQuote.calculationType}${ctx.latestQuote.monthlyPayment ? ` · ${formatMXN(ctx.latestQuote.monthlyPayment)}/mes` : ""}`
      : "Sin cotización";

  const seen = new Set<EscalationTrigger>();
  for (const t of triggers) {
    if (seen.has(t.trigger)) continue;
    seen.add(t.trigger);
    const existing = open.find((a) => a.trigger === t.trigger);
    if (existing) {
      out.push({ id: existing.id, trigger: t.trigger, deduplicated: true });
      continue;
    }
    const payload: s.MarioAlertPayload = {
      customer: typeof p.name === "string" ? `${p.name} (${ctx.customer.displayName})` : ctx.customer.displayName,
      vehicle: typeof p.vehicle_interest === "string" ? p.vehicle_interest : null,
      version: typeof p.version === "string" ? p.version : null,
      downPayment: typeof p.down_payment === "number" ? p.down_payment : null,
      monthlyTarget: typeof p.target_monthly_payment === "number" ? p.target_monthly_payment : null,
      purchaseTiming: p.purchase_timing !== undefined ? formatFactValue("purchase_timing", p.purchase_timing) : null,
      crmStage: state.stage,
      temperature: state.temperature,
      quoteStatus,
      creditStatus: creditStatus(state.tags, state.stage),
      mainObjection: Array.isArray(p.objections) && p.objections[0] ? p.objections[0] : null,
      reasonForEscalation: truncate(t.reason, 300),
      recommendedNextStep: truncate(t.nextStep, 300),
      shortSummary: truncate(state.summary, 400),
    };
    const [row] = await tx
      .insert(s.marioAlerts)
      .values({ workspaceId, customerId: ctx.customerId, conversationId: ctx.conversationId, agentRunId: runId, trigger: t.trigger, payload })
      .returning({ id: s.marioAlerts.id });
    out.push({ id: row!.id, trigger: t.trigger, deduplicated: false });
  }
  return out;
}

// ─────────────── resumen y compromisos ───────────────

async function updateSummary(
  input: EffectsInput,
  state: { profile: CustomerProfile; stage: CrmStage; temperature: Temperature },
): Promise<{ version: number | null; summary: string; commitmentsAdded: string[] }> {
  const { tx, ctx, output, workspaceId, runId, replyMessageId } = input;
  const prev = ctx.summary;
  const marioIds = new Set(ctx.recentMessages.filter((m) => m.sender === "mario").map((m) => m.id));
  const commitments = [...(prev?.commitments ?? [])];
  const added: string[] = [];
  for (const c of output?.mario_commitments_observed ?? []) {
    // Solo compromisos anclados a un mensaje REAL de Mario.
    if (!marioIds.has(c.source_message_id)) continue;
    if (commitments.some((x) => x.sourceMessageId === c.source_message_id || x.text === c.text)) continue;
    commitments.push({ text: truncate(c.text, 240), source: "mario_message", sourceMessageId: c.source_message_id, createdAt: ctx.now.toISOString(), status: "open" });
    added.push(c.text);
  }
  const summary =
    output?.summary_update?.trim() ? truncate(output.summary_update.trim(), 800) : prev?.text ?? buildDeterministicSummary(ctx.customer.displayName, state.profile, state.stage, state.temperature);
  const pending = output?.pending_items ? output.pending_items.map((p) => truncate(p, 200)).slice(0, 8) : (prev?.pendingItems ?? []);
  const nextAction = output?.next_action ? { type: output.next_action.type, description: truncate(output.next_action.description, 300) } : null;
  const changed =
    !prev || summary !== prev.text || added.length > 0 || JSON.stringify(pending) !== JSON.stringify(prev.pendingItems) || nextAction !== null;
  if (!changed) return { version: null, summary, commitmentsAdded: [] };
  const version = (prev?.version ?? 0) + 1;
  await tx.insert(s.customerSummaries).values({
    workspaceId,
    customerId: ctx.customerId,
    summary,
    commitments,
    pendingItems: pending,
    nextAction,
    coversUntilMessageId: replyMessageId,
    messageCount: ctx.totalMessages + 1,
    version,
    agentRunId: runId,
  });
  return { version, summary, commitmentsAdded: added };
}

// ─────────────── orquestación de efectos ───────────────

export async function applyTurnEffects(input: EffectsInput): Promise<AppliedEffects> {
  const { ctx, output } = input;
  const facts = await persistFacts(input);

  const llmEscalation = output?.requires_mario && output.escalation_reason ? [output.escalation_reason.trigger] : [];
  const deterministic = ctx.deterministicEscalations.map((e) => e.trigger);
  const crm = await applyCrm(input, [...deterministic, ...llmEscalation]);

  const quotes = await persistQuotes(input);
  const { actions, approvals, policyEscalations } = await handleActions(input, crm.stageTo, facts.profile);
  const tags = await applyTags(input, [...deterministic, ...llmEscalation, ...policyEscalations]);

  const summaryResult = await updateSummary(input, { profile: facts.profile, stage: crm.stageTo, temperature: crm.temperatureTo });

  // Escalamientos: reglas deterministas + propuesta del modelo + política de acciones + temperatura de cierre.
  const triggers: Array<{ trigger: EscalationTrigger; reason: string; nextStep: string }> = [
    ...ctx.deterministicEscalations.map((e) => ({ trigger: e.trigger, reason: e.reason, nextStep: e.recommendedNextStep })),
  ];
  if (output?.requires_mario && output.escalation_reason) {
    triggers.push({ trigger: output.escalation_reason.trigger, reason: output.escalation_reason.explanation, nextStep: output.escalation_reason.recommended_next_step });
  }
  for (const e of policyEscalations) {
    triggers.push({ trigger: e, reason: "Acción que requiere aprobación de Mario.", nextStep: "Revisar la solicitud en la bandeja de aprobaciones." });
  }
  if (
    triggers.length === 0 &&
    ctx.openAlerts.length === 0 &&
    (crm.stageTo === "negotiation" || crm.stageTo === "closing") &&
    crm.temperatureTo === "very_hot" &&
    !(crm.stageFrom === crm.stageTo && crm.temperatureFrom === crm.temperatureTo)
  ) {
    triggers.push({ trigger: "approaching_closing", reason: "Cliente muy caliente en etapa de negociación/cierre.", nextStep: "Mario entra a cerrar la venta." });
  }
  const allTags = [...ctx.tags, ...tags.added];
  const alerts = await createAlerts(input, triggers, {
    profile: facts.profile,
    stage: crm.stageTo,
    temperature: crm.temperatureTo,
    tags: allTags,
    summary: summaryResult.summary,
    quotes,
  });

  await audit(input.tx, input.workspaceId, ctx.customerId, "sofia", "turn_applied", "agent_run", input.runId, {
    factsChanged: facts.changes.map((c) => `${c.key}:${c.action}`),
    factsRejected: input.rejectedFacts.map((r) => `${r.what}:${r.reason}`),
    stage: crm.changed ? `${crm.stageFrom}→${crm.stageTo}` : null,
    temperature: crm.temperatureFrom !== crm.temperatureTo ? `${crm.temperatureFrom}→${crm.temperatureTo}` : null,
    tagsAdded: tags.added,
    alerts: alerts.filter((a) => !a.deduplicated).map((a) => a.trigger),
    approvals: approvals.map((a) => a.actionType),
    actions: actions.map((a) => `${a.tool}:${a.decision}`),
    quotes: quotes.map((q) => `${q.calculationType}:${q.status}`),
    guard: input.guardCodes,
  });

  return {
    facts: { changes: facts.changes, rejected: input.rejectedFacts },
    crm,
    tags,
    alerts,
    approvals,
    actions,
    quotes,
    summaryVersion: summaryResult.version,
    commitmentsAdded: summaryResult.commitmentsAdded,
  };
}

/** Utilidad para servicios: etiquetas activas. */
export async function activeTags(db: Db, customerId: string): Promise<string[]> {
  const rows = await db
    .select({ tag: s.customerTags.tag })
    .from(s.customerTags)
    .where(and(eq(s.customerTags.customerId, customerId), isNull(s.customerTags.removedAt)));
  return rows.map((r) => r.tag);
}
