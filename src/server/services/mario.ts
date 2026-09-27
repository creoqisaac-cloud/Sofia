/**
 * Bandeja de Mario: alertas "🔥 MARIO, ENTRA TÚ" y solicitudes de aprobación.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { APPROVAL_ACTION_LABELS, ESCALATION_TRIGGER_LABELS, type ApprovalActionType } from "@/domain/enums";
import type { AppContext } from "../app";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { ServiceError } from "./customers";

export async function getInbox(app: AppContext) {
  const alerts = await app.db
    .select({ alert: s.marioAlerts, customerName: s.customers.displayName })
    .from(s.marioAlerts)
    .innerJoin(s.customers, eq(s.customers.id, s.marioAlerts.customerId))
    .where(and(eq(s.marioAlerts.workspaceId, app.workspaceId), inArray(s.marioAlerts.status, ["open", "acknowledged"])))
    .orderBy(desc(s.marioAlerts.createdAt));
  const approvals = await app.db
    .select({ approval: s.approvalRequests, customerName: s.customers.displayName })
    .from(s.approvalRequests)
    .innerJoin(s.customers, eq(s.customers.id, s.approvalRequests.customerId))
    .where(and(eq(s.approvalRequests.workspaceId, app.workspaceId), eq(s.approvalRequests.status, "pending")))
    .orderBy(desc(s.approvalRequests.createdAt));
  return {
    alerts: alerts.map(({ alert, customerName }) => ({ ...alert, customerName, triggerLabel: ESCALATION_TRIGGER_LABELS[alert.trigger] })),
    approvals: approvals.map(({ approval, customerName }) => ({ ...approval, customerName, actionLabel: APPROVAL_ACTION_LABELS[approval.actionType] })),
  };
}

export async function updateAlertStatus(app: AppContext, alertId: string, status: "acknowledged" | "resolved" | "dismissed") {
  const now = new Date();
  const [row] = await app.db
    .update(s.marioAlerts)
    .set({
      status,
      acknowledgedAt: status === "acknowledged" ? now : undefined,
      resolvedAt: status === "resolved" || status === "dismissed" ? now : undefined,
    })
    .where(and(eq(s.marioAlerts.id, alertId), eq(s.marioAlerts.workspaceId, app.workspaceId)))
    .returning();
  if (!row) throw new ServiceError("Alerta no encontrada.", 404);
  await app.db.insert(s.auditEvents).values({
    workspaceId: app.workspaceId,
    customerId: row.customerId,
    actorType: "mario",
    eventType: `alert_${status}`,
    entityType: "mario_alert",
    entityId: row.id,
    data: { trigger: row.trigger },
  });
  return row;
}

/**
 * Mario decide una aprobación. Queda una nota interna (SISTEMA) en la
 * conversación: así Sofía sabe, con evidencia real, qué decidió Mario.
 */
export async function decideApproval(app: AppContext, approvalId: string, decision: "approved" | "rejected", notes: string | null) {
  return app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [row] = await tx
      .select()
      .from(s.approvalRequests)
      .where(and(eq(s.approvalRequests.id, approvalId), eq(s.approvalRequests.workspaceId, app.workspaceId)));
    if (!row) throw new ServiceError("Solicitud no encontrada.", 404);
    if (row.status !== "pending") throw new ServiceError("La solicitud ya fue decidida.", 409);
    const [updated] = await tx
      .update(s.approvalRequests)
      .set({ status: decision, decidedBy: app.advisorUserId, decidedAt: new Date(), decisionNotes: notes?.trim() || null })
      .where(eq(s.approvalRequests.id, approvalId))
      .returning();
    if (row.conversationId) {
      const label = APPROVAL_ACTION_LABELS[row.actionType as ApprovalActionType];
      await tx.insert(s.messages).values({
        workspaceId: app.workspaceId,
        conversationId: row.conversationId,
        customerId: row.customerId,
        sender: "system",
        body: `Mario ${decision === "approved" ? "aprobó" : "rechazó"}: ${label}.${notes?.trim() ? ` Nota de Mario: ${notes.trim()}` : ""}`,
        metadata: { approvalId },
      });
    }
    await tx.insert(s.auditEvents).values({
      workspaceId: app.workspaceId,
      customerId: row.customerId,
      actorType: "mario",
      eventType: `approval_${decision}`,
      entityType: "approval_request",
      entityId: row.id,
      data: { actionType: row.actionType },
    });
    return updated!;
  });
}
