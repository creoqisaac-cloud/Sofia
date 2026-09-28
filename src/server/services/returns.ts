/**
 * Devoluciones — estructura mínima. Mario pidió "devoluciones" pero el proceso aún no está
 * descrito (tipos, reglas, montos, responsables). No se implementa lógica especulativa.
 */
import { and, desc, eq } from "drizzle-orm";
import type { AppContext } from "../app";
import * as s from "../db/schema";
import { ServiceError } from "./errors";

export const RETURNS_PENDING_DEFINITION = "Proceso de devolución pendiente de definición por Mario.";
export const RETURN_STATUS_LABELS: Record<string, string> = { open: "Abierta", resolved: "Resuelta", cancelled: "Cancelada" };

export async function createReturnCase(app: AppContext, input: { customerId: string; saleId?: string | null; reason?: string | null; amount?: number | null; notes?: string | null }) {
  const [c] = await app.db.select().from(s.customers).where(and(eq(s.customers.id, input.customerId), eq(s.customers.workspaceId, app.workspaceId)));
  if (!c) throw new ServiceError("Cliente no encontrado.", 404);
  const [r] = await app.db
    .insert(s.returnCases)
    .values({ workspaceId: app.workspaceId, customerId: input.customerId, saleId: input.saleId ?? null, reason: input.reason?.trim() || null, amount: input.amount ?? null, notes: input.notes?.trim() || null })
    .returning();
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "return_case_opened", entityType: "return_case", entityId: r!.id, customerId: input.customerId });
  return r!;
}

export async function setReturnStatus(app: AppContext, id: string, status: "open" | "resolved" | "cancelled") {
  const [r] = await app.db.select().from(s.returnCases).where(and(eq(s.returnCases.id, id), eq(s.returnCases.workspaceId, app.workspaceId)));
  if (!r) throw new ServiceError("Devolución no encontrada.", 404);
  await app.db.update(s.returnCases).set({ status, resolvedAt: status === "open" ? null : app.clock.now() }).where(eq(s.returnCases.id, id));
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "return_case_status", entityType: "return_case", entityId: id, customerId: r.customerId, data: { from: r.status, to: status } });
}

export async function listReturnCases(app: AppContext) {
  return app.db
    .select({ ret: s.returnCases, customerName: s.customers.displayName })
    .from(s.returnCases)
    .innerJoin(s.customers, eq(s.customers.id, s.returnCases.customerId))
    .where(eq(s.returnCases.workspaceId, app.workspaceId))
    .orderBy(desc(s.returnCases.openedAt));
}
