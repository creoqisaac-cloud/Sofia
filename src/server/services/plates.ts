/**
 * Trámite de placas — ASISTENTE operativo (no automatiza portales).
 * Los requisitos tienen FUENTE: los captura Mario (o son DEMO). Sofía no inventa requisitos oficiales.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../app";
import * as s from "../db/schema";
import { ServiceError } from "./errors";

export const PLATE_STATUSES = ["not_started", "collecting_documents", "ready", "submitted", "waiting", "completed", "problem"] as const;
export type PlateStatus = (typeof PLATE_STATUSES)[number];
export const PLATE_STATUS_LABELS: Record<PlateStatus, string> = {
  not_started: "Sin iniciar",
  collecting_documents: "Juntando documentos",
  ready: "Listo para enviar",
  submitted: "Enviado",
  waiting: "En espera",
  completed: "Terminado",
  problem: "Con problema",
};
export const PLATE_OPEN_STATUSES: PlateStatus[] = ["not_started", "collecting_documents", "ready", "submitted", "waiting", "problem"];
export const NO_PLATE_REQUIREMENTS = "Mario aún no ha capturado los requisitos de placas. Agrégalos en Más → Placas (con su fuente).";

export async function listPlateRequirements(app: AppContext) {
  return app.db.select().from(s.plateRequirements).where(and(eq(s.plateRequirements.workspaceId, app.workspaceId), eq(s.plateRequirements.active, true))).orderBy(asc(s.plateRequirements.sortOrder));
}

export async function addPlateRequirement(app: AppContext, input: { label: string; sourceLabel: string }) {
  const label = input.label.trim();
  const source = input.sourceLabel.trim();
  if (!label || !source) throw new ServiceError("Cada requisito necesita nombre y fuente.");
  const [r] = await app.db.insert(s.plateRequirements).values({ workspaceId: app.workspaceId, label, sourceLabel: source, sortOrder: Date.now() % 100000 }).returning();
  return r!;
}

export async function removePlateRequirement(app: AppContext, id: string) {
  await app.db.update(s.plateRequirements).set({ active: false }).where(and(eq(s.plateRequirements.id, id), eq(s.plateRequirements.workspaceId, app.workspaceId)));
}

/** Abre (o devuelve) el trámite del cliente; copia los requisitos vigentes con su fuente. */
export async function ensurePlateCase(app: AppContext, customerId: string, saleId?: string | null) {
  const [existing] = await app.db
    .select()
    .from(s.plateCases)
    .where(and(eq(s.plateCases.workspaceId, app.workspaceId), eq(s.plateCases.customerId, customerId), inArray(s.plateCases.status, PLATE_OPEN_STATUSES)))
    .orderBy(desc(s.plateCases.createdAt))
    .limit(1);
  if (existing) return existing;
  const [customer] = await app.db.select().from(s.customers).where(and(eq(s.customers.id, customerId), eq(s.customers.workspaceId, app.workspaceId)));
  if (!customer) throw new ServiceError("Cliente no encontrado.", 404);
  const [sale] = saleId
    ? await app.db.select().from(s.saleRecords).where(eq(s.saleRecords.id, saleId))
    : await app.db.select().from(s.saleRecords).where(eq(s.saleRecords.customerId, customerId)).orderBy(desc(s.saleRecords.createdAt)).limit(1);
  const reqs = await listPlateRequirements(app);
  const [pc] = await app.db
    .insert(s.plateCases)
    .values({
      workspaceId: app.workspaceId,
      customerId,
      saleId: sale?.id ?? null,
      vehicleLabel: sale?.unitDescription ?? null,
      vin: sale?.vin ?? null,
      status: reqs.length ? "collecting_documents" : "not_started",
      requirements: reqs.map((r) => ({ id: r.id, label: r.label, source: r.sourceLabel, received: false, receivedAt: null })),
      nextStep: reqs.length ? "Juntar documentos" : "Capturar requisitos de placas",
      isDemo: customer.isDemo,
    })
    .returning();
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "plate_case_opened", entityType: "plate_case", entityId: pc!.id, customerId });
  return pc!;
}

export async function getPlateCase(app: AppContext, id: string) {
  const [pc] = await app.db
    .select({ plate: s.plateCases, customerName: s.customers.displayName })
    .from(s.plateCases)
    .innerJoin(s.customers, eq(s.customers.id, s.plateCases.customerId))
    .where(and(eq(s.plateCases.id, id), eq(s.plateCases.workspaceId, app.workspaceId)));
  if (!pc) throw new ServiceError("Trámite no encontrado.", 404);
  return pc;
}

export function plateMissing(pc: typeof s.plateCases.$inferSelect) {
  return pc.requirements.filter((r) => !r.received).map((r) => r.label);
}

export async function setRequirementReceived(app: AppContext, caseId: string, requirementId: string, received: boolean) {
  const { plate } = await getPlateCase(app, caseId);
  const now = app.clock.now();
  const requirements = plate.requirements.map((r) => (r.id === requirementId ? { ...r, received, receivedAt: received ? now.toISOString() : null } : r));
  const allIn = requirements.length > 0 && requirements.every((r) => r.received);
  const status: PlateStatus = plate.status === "collecting_documents" && allIn ? "ready" : plate.status === "ready" && !allIn ? "collecting_documents" : (plate.status as PlateStatus);
  await app.db
    .update(s.plateCases)
    .set({ requirements, status, nextStep: allIn ? "Enviar a trámite" : "Juntar documentos", updatedAt: now })
    .where(eq(s.plateCases.id, caseId));
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "plate_requirement", entityType: "plate_case", entityId: caseId, customerId: plate.customerId, data: { requirementId, received } });
}

export async function updatePlateCase(app: AppContext, caseId: string, patch: { status?: PlateStatus; nextStep?: string | null; dueDate?: Date | null; notes?: string | null; vin?: string | null }) {
  const { plate } = await getPlateCase(app, caseId);
  if (patch.status && !PLATE_STATUSES.includes(patch.status)) throw new ServiceError("Estado inválido.");
  await app.db.update(s.plateCases).set({ ...patch, updatedAt: app.clock.now() }).where(eq(s.plateCases.id, caseId));
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "plate_case_updated", entityType: "plate_case", entityId: caseId, customerId: plate.customerId, data: { fields: Object.keys(patch), from: plate.status, to: patch.status ?? plate.status } });
}

export async function listPlateCases(app: AppContext, opts: { openOnly?: boolean; customerId?: string } = {}) {
  const conds = [eq(s.plateCases.workspaceId, app.workspaceId)];
  if (opts.openOnly) conds.push(inArray(s.plateCases.status, PLATE_OPEN_STATUSES));
  if (opts.customerId) conds.push(eq(s.plateCases.customerId, opts.customerId));
  return app.db
    .select({ plate: s.plateCases, customerName: s.customers.displayName })
    .from(s.plateCases)
    .innerJoin(s.customers, eq(s.customers.id, s.plateCases.customerId))
    .where(and(...conds))
    .orderBy(desc(s.plateCases.updatedAt));
}
