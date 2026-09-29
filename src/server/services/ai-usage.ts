/**
 * Métricas de uso de IA: cada llamada a un proveedor de IA (LLM o visión) deja un registro.
 * Las funciones normales (buscar, documentos, solicitud, PDF, citas, estados) no llaman IA.
 * No se guardan prompts ni respuestas (pueden tener datos personales), solo conteos.
 */
import { and, count, eq, gte } from "drizzle-orm";
import type { AppContext } from "../app";
import * as s from "../db/schema";

export async function recordAiUsage(app: AppContext, e: { provider: string; purpose: "conversation" | "extraction" | "summary" | "drafting" | "command"; ok: boolean; durationMs?: number; inputTokens?: number; outputTokens?: number }) {
  await app.db.insert(s.aiUsageEvents).values({ workspaceId: app.workspaceId, provider: e.provider, purpose: e.purpose, ok: e.ok, durationMs: e.durationMs ?? null, inputTokens: e.inputTokens ?? null, outputTokens: e.outputTokens ?? null });
}

/** ¿El proveedor del cerebro es IA real? (el motor demo es determinista y no cuenta) */
export const isAiProvider = (name: string) => name !== "demo" && !name.startsWith("scripted");

export async function aiUsageSince(app: AppContext, since: Date) {
  const rows = await app.db
    .select({ provider: s.aiUsageEvents.provider, purpose: s.aiUsageEvents.purpose, n: count() })
    .from(s.aiUsageEvents)
    .where(and(eq(s.aiUsageEvents.workspaceId, app.workspaceId), gte(s.aiUsageEvents.createdAt, since)))
    .groupBy(s.aiUsageEvents.provider, s.aiUsageEvents.purpose);
  return { total: rows.reduce((a, r) => a + Number(r.n), 0), rows };
}
