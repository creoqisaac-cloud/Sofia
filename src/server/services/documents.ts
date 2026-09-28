/**
 * Expediente documental lógico: checklist por cliente (y por financiera cuando
 * aplica). Las reglas son por financiera: las de Banorte NO se aplican a BBVA.
 * Solo estados y referencias; el contenido nunca pasa por aquí.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { DOCUMENT_STATUSES, DOCUMENT_TYPE_LABELS, type DocumentStatus, type DocumentType } from "@/domain/enums";
import { effectiveStatus } from "@/domain/knowledge";
import type { AppContext } from "../app";
import * as s from "../db/schema";
import { ServiceError } from "./errors";

/** Tipos base del expediente de Mario (sin importar financiera). */
export const BASE_CHECKLIST: DocumentType[] = ["ine", "proof_of_address", "proof_of_income", "tax_id", "bank_statement", "employment_letter", "credit_application"];

function normalizeStatus(status: string): DocumentStatus {
  if (status === "validated") return "accepted";
  if ((DOCUMENT_STATUSES as readonly string[]).includes(status)) return status as DocumentStatus;
  return "missing";
}

export interface ChecklistItem {
  docType: DocumentType;
  label: string;
  status: DocumentStatus;
  documentId: string | null;
  requiredBy: Array<{ institution: string; description: string | null; source: string; version: string; isDemo: boolean }>;
  notes: string | null;
}

export async function getDocumentChecklist(app: AppContext, customerId: string, opts: { institutionIds?: string[] } = {}): Promise<ChecklistItem[]> {
  const docs = await app.db
    .select({ id: s.documents.id, docType: s.documents.docType, status: s.documents.status, reviewNotes: s.documents.reviewNotes, updatedAt: s.documents.updatedAt })
    .from(s.documents)
    .where(and(eq(s.documents.customerId, customerId), eq(s.documents.workspaceId, app.workspaceId)))
    .orderBy(desc(s.documents.updatedAt));

  // Tipo de cliente según su situación laboral (perfil universal).
  const [profile] = await app.db.select().from(s.customerProfiles).where(eq(s.customerProfiles.customerId, customerId));
  const employment = (profile?.data as Record<string, unknown> | undefined)?.employment_status;
  const customerType = typeof employment === "string" ? employment : null;

  let institutionIds = opts.institutionIds;
  if (!institutionIds) {
    const apps = await app.db.select({ institutionId: s.creditApplications.institutionId, status: s.creditApplications.status }).from(s.creditApplications).where(eq(s.creditApplications.customerId, customerId));
    institutionIds = Array.from(new Set(apps.filter((a) => a.status !== "cancelled").map((a) => a.institutionId)));
  }
  const now = app.clock.now();
  const rules = institutionIds.length
    ? await app.db
        .select({ rule: s.documentRequirements, institution: s.creditInstitutions })
        .from(s.documentRequirements)
        .innerJoin(s.creditInstitutions, eq(s.creditInstitutions.id, s.documentRequirements.institutionId))
        .where(inArray(s.documentRequirements.institutionId, institutionIds))
    : [];
  const applicable = rules.filter(({ rule }) => {
    const eff = effectiveStatus({ status: "confirmed", validFrom: rule.validFrom, validTo: rule.validTo }, now);
    if (eff.expired || eff.notYetValid) return false;
    return rule.customerType === "all" || rule.customerType === customerType;
  });

  const types = Array.from(new Set([...BASE_CHECKLIST, ...applicable.map((r) => r.rule.documentType), ...docs.map((d) => d.docType)])) as DocumentType[];
  return types.map((docType) => {
    const doc = docs.find((d) => d.docType === docType);
    return {
      docType,
      label: DOCUMENT_TYPE_LABELS[docType],
      status: doc ? normalizeStatus(doc.status) : "missing",
      documentId: doc?.id ?? null,
      notes: doc?.reviewNotes ?? null,
      requiredBy: applicable
        .filter((r) => r.rule.documentType === docType)
        .map((r) => ({ institution: r.institution.name, description: r.rule.description, source: r.rule.source, version: r.rule.version, isDemo: r.rule.isDemo })),
    };
  });
}

export async function setDocumentStatus(app: AppContext, customerId: string, docType: DocumentType, status: DocumentStatus, notes?: string | null) {
  if (!(DOCUMENT_STATUSES as readonly string[]).includes(status)) throw new ServiceError("Estado inválido.");
  const now = app.clock.now();
  const [existing] = await app.db.select().from(s.documents).where(and(eq(s.documents.customerId, customerId), eq(s.documents.workspaceId, app.workspaceId), eq(s.documents.docType, docType))).orderBy(desc(s.documents.updatedAt)).limit(1);
  if (existing) {
    await app.db
      .update(s.documents)
      .set({ status, reviewNotes: notes ?? existing.reviewNotes, receivedAt: status === "received" && !existing.receivedAt ? now : existing.receivedAt, updatedAt: new Date() })
      .where(eq(s.documents.id, existing.id));
  } else {
    await app.db.insert(s.documents).values({ workspaceId: app.workspaceId, customerId, docType, status, reviewNotes: notes ?? null, receivedAt: status === "received" ? now : null, requestedAt: now, isSensitive: true });
  }
  await app.db.insert(s.auditEvents).values({
    workspaceId: app.workspaceId,
    customerId,
    actorType: "mario",
    actorId: app.advisorUserId,
    eventType: "document_status",
    entityType: "document",
    data: { docType, status },
  });
}
