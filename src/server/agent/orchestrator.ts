/**
 * Orquestador de un turno de Sofía.
 *
 *   mensaje del cliente (ya persistido)
 *     → contexto por capas (memoria + conocimiento recuperado)
 *     → proveedor (Claude o motor demo) → salida estructurada
 *     → validación de esquema (zod) → anclaje de hechos → guardrails
 *        (si bloquea: 1 reintento con retroalimentación; si persiste: respuesta segura)
 *     → efectos validados en UNA transacción (+ mensaje de respuesta + agent_run + auditoría)
 *
 * El texto libre del modelo nunca modifica la BD directamente.
 */
import { isAiProvider, recordAiUsage } from "../services/ai-usage";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { guardReply, type GuardReport, type GuardViolation } from "@/domain/guards";
import type { AppContext } from "../app";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { logger } from "../lib/logger";
import { applyTurnEffects, type AppliedEffects } from "./effects";
import { AgentOutputSchema, type AgentOutput } from "./output-schema";
import { buildPrompt } from "./prompt";
import { ProviderError } from "./providers/types";
import { newScratch, ReadToolExecutor } from "./read-tools";
import { buildTurnContext, type TurnContext } from "./turn-context";
import {
  buildGuardContext,
  buildSafeReply,
  validateKnowledgeUsed,
  validateObservedFacts,
  type AcceptedFact,
  type RejectedProposal,
  type ValidatedKnowledgeRef,
} from "./validation";

export interface TurnResult {
  status: "ok" | "fallback";
  agentRunId: string;
  replyMessageId: string;
  reply: string;
  output: AgentOutput | null;
  guard: GuardReport;
  effects: AppliedEffects;
  knowledgeUsed: ValidatedKnowledgeRef[];
  provider: string;
  attempts: number;
  contextStats: Record<string, number>;
}

const MAX_ATTEMPTS = 2;

export async function runSofiaTurn(app: AppContext, args: { conversationId: string; inboundMessageId: string }): Promise<TurnResult> {
  const started = Date.now();
  const now = app.clock.now();
  const ctx = await buildTurnContext(app.db, { workspaceId: app.workspaceId, conversationId: args.conversationId, newMessageId: args.inboundMessageId, now });
  const scratch = newScratch();
  const tools = new ReadToolExecutor(ctx, scratch);

  let output: AgentOutput | null = null;
  let accepted: AcceptedFact[] = [];
  let rejectedFacts: RejectedProposal[] = [];
  let guard: GuardReport | null = null;
  let correction: string | undefined;
  let attempts = 0;
  let model: string | null = app.provider.model;
  let usage: Record<string, number> | undefined;
  let lastError: string | null = null;
  let contextStats: Record<string, number> = {};
  const maxAttempts = app.provider.supportsCorrection ? MAX_ATTEMPTS : 1;

  while (attempts < maxAttempts) {
    attempts++;
    const prompt = buildPrompt(ctx, { correction });
    contextStats = prompt.stats;
    try {
      const t0 = Date.now();
      const res = await app.provider.generate({ ctx, prompt, tools });
      // Métrica de IA: solo proveedores reales (el motor demo es determinista).
      if (isAiProvider(app.provider.name)) {
        await recordAiUsage(app, { provider: app.provider.name, purpose: "conversation", ok: true, durationMs: Date.now() - t0, inputTokens: res.usage?.input_tokens, outputTokens: res.usage?.output_tokens });
      }
      model = res.model ?? model;
      usage = res.usage;
      const parsed = AgentOutputSchema.safeParse(res.raw);
      if (!parsed.success) {
        lastError = `Salida inválida: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
        correction = `El JSON no cumplió el esquema (${lastError}).`;
        continue;
      }
      output = parsed.data;
      ({ accepted, rejected: rejectedFacts } = validateObservedFacts(output.observed_facts, ctx));
      guard = guardReply(output.customer_reply, buildGuardContext(ctx, scratch, accepted));
      if (!guard.blocked) break;
      correction = guard.violations
        .filter((v) => v.action === "blocked")
        .map((v) => `- ${v.code}: ${v.detail}`)
        .join("\n");
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.warn("sofia.provider_error", { kind: error instanceof ProviderError ? error.kind : "unknown", error: lastError });
      if (error instanceof ProviderError && (error.kind === "refusal" || error.kind === "api_error")) break;
    }
  }

  const escalating = Boolean(output?.requires_mario) || ctx.deterministicEscalations.length > 0;
  let status: TurnResult["status"] = "ok";
  let finalReply: string;
  if (output && guard && !guard.blocked) {
    finalReply = guard.finalReply;
  } else {
    status = "fallback";
    const violations: GuardViolation[] = guard?.violations ?? [];
    finalReply = buildSafeReply(ctx, violations, escalating);
    // La respuesta segura también pasa por los guardrails.
    const safeGuard = guardReply(finalReply, buildGuardContext(ctx, scratch, accepted));
    guard = {
      originalReply: guard?.originalReply ?? output?.customer_reply ?? "",
      finalReply: safeGuard.finalReply,
      violations: [...violations, ...safeGuard.violations],
      blocked: true,
    };
    finalReply = safeGuard.finalReply;
    if (output) {
      // Se conservan las propuestas estructuradas (validadas por separado), pero se registra
      // un seguimiento para que Mario revise lo que no se pudo responder.
      output = {
        ...output,
        requested_tools: [
          ...output.requested_tools.filter((t) => t.tool !== "create_followup"),
          {
            tool: "create_followup",
            reason: "Respuesta bloqueada por guardrails",
            arguments: { requested_window: null, document_type: null, amount: null, note: `Revisar respuesta bloqueada (${violations.map((v) => v.code).join(", ") || "sin salida válida"}).` },
          },
        ],
      };
    }
  }

  const knowledge = output ? validateKnowledgeUsed(output.knowledge_used, ctx, scratch) : { refs: [], rejected: [] };
  const runId = randomUUID();

  const result = await app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [reply] = await tx
      .insert(s.messages)
      .values({
        workspaceId: app.workspaceId,
        conversationId: ctx.conversationId,
        customerId: ctx.customerId,
        sender: "sofia",
        body: finalReply,
        metadata: { agentRunId: runId, status, guard: guard!.violations.map((v) => v.code) },
      })
      .returning({ id: s.messages.id });

    await tx.insert(s.agentRuns).values({
      id: runId,
      workspaceId: app.workspaceId,
      customerId: ctx.customerId,
      conversationId: ctx.conversationId,
      inboundMessageId: ctx.newMessage.id,
      replyMessageId: reply!.id,
      provider: app.provider.name,
      model,
      status,
      contextStats,
      output: output ? (output as unknown as Record<string, unknown>) : null,
      guardReport: { violations: guard!.violations, blocked: guard!.blocked, attempts, rejectedKnowledge: knowledge.rejected },
      knowledgeUsed: knowledge.refs as unknown as Array<Record<string, unknown>>,
      toolCalls: scratch.toolCalls as unknown as Array<Record<string, unknown>>,
      usage: usage ?? null,
      latencyMs: Date.now() - started,
      error: lastError,
    });

    const effects = await applyTurnEffects({
      tx,
      workspaceId: app.workspaceId,
      ctx,
      output,
      acceptedFacts: accepted,
      rejectedFacts,
      finalReply,
      knowledgeRefs: knowledge.refs,
      scratch,
      runId,
      replyMessageId: reply!.id,
      guardBlocked: status === "fallback",
      guardCodes: guard!.violations.map((v) => v.code),
    });

    await tx.update(s.agentRuns).set({ appliedEffects: effects as unknown as Record<string, unknown> }).where(eq(s.agentRuns.id, runId));
    await tx.update(s.conversations).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(s.conversations.id, ctx.conversationId));
    return { replyId: reply!.id, effects };
  });

  logger.info("sofia.turn", {
    status,
    provider: app.provider.name,
    attempts,
    guard: guard!.violations.map((v) => v.code),
    latencyMs: Date.now() - started,
  });

  return {
    status,
    agentRunId: runId,
    replyMessageId: result.replyId,
    reply: finalReply,
    output,
    guard: guard!,
    effects: result.effects,
    knowledgeUsed: knowledge.refs,
    provider: app.provider.name,
    attempts,
    contextStats,
  };
}

export type { TurnContext };
