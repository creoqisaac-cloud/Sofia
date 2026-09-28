/**
 * Módulo de crédito: financieras, plantillas, solicitudes (muchas por cliente),
 * análisis del perfil contra el adaptador y generación de borradores PDF.
 */
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { AUTO_STATUSES, MANUAL_TRANSITIONS, analyzeApplication, buildFillPlan, getAdapter, type ApplicationAnalysis, type FieldStates } from "@/domain/credit";
import { CREDIT_APPLICATION_STATUS_LABELS, type CreditApplicationStatus } from "@/domain/enums";
import type { AppContext } from "../app";
import { buildDemoTemplate, fillPdf, inspectPdfFields, suggestMapping } from "../credit/pdf";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { ServiceError } from "./errors";
import { getProfileState } from "./profile";

export async function listInstitutions(app: AppContext) {
  return app.db.select().from(s.creditInstitutions).where(and(eq(s.creditInstitutions.workspaceId, app.workspaceId), eq(s.creditInstitutions.active, true))).orderBy(asc(s.creditInstitutions.code));
}

async function institutionByCode(db: Db, workspaceId: string, code: string) {
  const [inst] = await db.select().from(s.creditInstitutions).where(and(eq(s.creditInstitutions.workspaceId, workspaceId), eq(s.creditInstitutions.code, code.toUpperCase())));
  return inst ?? null;
}

/** Registra una financiera si no existe (idempotente). */
export async function ensureInstitution(db: Db, workspaceId: string, code: string, name: string) {
  const existing = await institutionByCode(db, workspaceId, code);
  if (existing) return existing;
  const [row] = await db.insert(s.creditInstitutions).values({ workspaceId, code: code.toUpperCase(), name }).returning();
  return row!;
}

/**
 * Registra una plantilla PDF. El original se guarda intacto en almacenamiento privado
 * (fuera de git). Si no se da mapeo, se propone uno por nombres (solo campos exactos
 * o muy parecidos) y queda para revisión.
 */
export async function registerTemplate(
  app: AppContext,
  input: { institutionCode: string; name: string; version: string; bytes: Uint8Array; fileName: string; fieldMapping?: Record<string, string>; notes?: string; isDemo?: boolean },
) {
  const adapter = getAdapter(input.institutionCode);
  if (!adapter) throw new ServiceError(`No hay adaptador para ${input.institutionCode}.`);
  const fields = await inspectPdfFields(input.bytes);
  if (fields.length === 0) throw new ServiceError("El PDF no tiene campos AcroForm; no se usa OCR ni coordenadas.");
  const institution = await ensureInstitution(app.db, app.workspaceId, adapter.institutionCode, adapter.institutionName);
  const ref = await app.storage.put(app.workspaceId, "templates", input.bytes, "application/pdf");
  const mapping = input.fieldMapping ?? suggestMapping(adapter, fields);
  const [row] = await app.db
    .insert(s.applicationTemplates)
    .values({
      workspaceId: app.workspaceId,
      institutionId: institution.id,
      name: input.name,
      version: input.version,
      sourceDocument: { ...ref, fileName: input.fileName },
      fieldMapping: mapping,
      notes: input.notes ?? null,
      isDemo: Boolean(input.isDemo),
    })
    .returning();
  const mappedSlots = Object.keys(mapping).length;
  return { template: row!, pdfFields: fields.length, mappedSlots, unmappedSlots: adapter.slots.filter((sl) => !mapping[sl.slot]).map((sl) => sl.slot) };
}

/** Plantillas DEMO sintéticas (idempotente). */
export async function ensureDemoTemplates(app: AppContext) {
  for (const code of ["BBVA", "BANORTE"]) {
    const adapter = getAdapter(code)!;
    const inst = await ensureInstitution(app.db, app.workspaceId, adapter.institutionCode, adapter.institutionName);
    const existing = await app.db.select({ id: s.applicationTemplates.id }).from(s.applicationTemplates).where(eq(s.applicationTemplates.institutionId, inst.id));
    if (existing.length) continue;
    const bytes = await buildDemoTemplate(adapter);
    await registerTemplate(app, {
      institutionCode: code,
      name: `PLANTILLA DEMO ${adapter.institutionName} (sintética)`,
      version: "demo-1",
      bytes,
      fileName: `demo-${code.toLowerCase()}.pdf`,
      fieldMapping: Object.fromEntries(adapter.slots.map((sl) => [sl.slot, sl.slot])),
      notes: "Plantilla SINTÉTICA para pruebas. Sustituir por el PDF real registrándolo con `npm run pdf:register`.",
      isDemo: true,
    });
  }
}

async function activeTemplate(db: Db, institutionId: string) {
  const [tpl] = await db
    .select()
    .from(s.applicationTemplates)
    .where(and(eq(s.applicationTemplates.institutionId, institutionId), eq(s.applicationTemplates.active, true)))
    .orderBy(desc(s.applicationTemplates.uploadedAt))
    .limit(1);
  return tpl ?? null;
}

async function fieldStatesFor(db: Db, customerId: string): Promise<{ states: FieldStates; profile: Awaited<ReturnType<typeof getProfileState>> }> {
  const profile = await getProfileState(db, customerId);
  const states: FieldStates = {};
  for (const [key, f] of Object.entries(profile.fields)) {
    states[key] = { status: f.state.status, value: f.state.value, factId: f.state.factId, sourceLabel: f.state.sourceLabel };
  }
  return { states, profile };
}

async function addEvent(db: Db, workspaceId: string, applicationId: string, from: CreditApplicationStatus | null, to: CreditApplicationStatus, reason: string, actorType: "sofia" | "mario" | "system", actorId: string | null) {
  await db.insert(s.creditApplicationEvents).values({ workspaceId, applicationId, fromStatus: from, toStatus: to, reason, actorType, actorId });
}

async function loadApplication(db: Db, workspaceId: string, applicationId: string) {
  const [row] = await db
    .select({ application: s.creditApplications, institution: s.creditInstitutions })
    .from(s.creditApplications)
    .innerJoin(s.creditInstitutions, eq(s.creditInstitutions.id, s.creditApplications.institutionId))
    .where(and(eq(s.creditApplications.id, applicationId), eq(s.creditApplications.workspaceId, workspaceId)));
  if (!row) throw new ServiceError("Solicitud no encontrada.", 404);
  return row;
}

/** Recalcula el estado automático (solo entre draft/missing_information/conflict/ready_for_review). */
export async function refreshApplicationStatus(app: AppContext, applicationId: string): Promise<{ status: CreditApplicationStatus; analysis: ApplicationAnalysis }> {
  const { application, institution } = await loadApplication(app.db, app.workspaceId, applicationId);
  const adapter = getAdapter(institution.code);
  if (!adapter) throw new ServiceError(`No hay adaptador para ${institution.code}.`);
  const { states } = await fieldStatesFor(app.db, application.customerId);
  const analysis = analyzeApplication(adapter, states);
  let status = application.status;
  if ((AUTO_STATUSES as readonly string[]).includes(status) && status !== analysis.suggestedStatus) {
    await app.db.update(s.creditApplications).set({ status: analysis.suggestedStatus, updatedAt: new Date() }).where(eq(s.creditApplications.id, applicationId));
    await addEvent(app.db, app.workspaceId, applicationId, status, analysis.suggestedStatus, "Recalculado a partir del perfil del cliente.", "system", null);
    status = analysis.suggestedStatus;
  }
  return { status, analysis };
}

export async function refreshCustomerApplications(app: AppContext, customerId: string) {
  const apps = await app.db.select({ id: s.creditApplications.id }).from(s.creditApplications).where(eq(s.creditApplications.customerId, customerId));
  for (const a of apps) await refreshApplicationStatus(app, a.id);
}

export async function createApplication(app: AppContext, input: { customerId: string; institutionCode: string; quoteId?: string | null }) {
  const institution = await institutionByCode(app.db, app.workspaceId, input.institutionCode);
  if (!institution) throw new ServiceError("Financiera no disponible.");
  const template = await activeTemplate(app.db, institution.id);
  const [row] = await app.db
    .insert(s.creditApplications)
    .values({ workspaceId: app.workspaceId, customerId: input.customerId, institutionId: institution.id, templateId: template?.id ?? null, quoteId: input.quoteId ?? null, status: "draft", createdBy: "mario" })
    .returning();
  await addEvent(app.db, app.workspaceId, row!.id, null, "draft", `Nueva solicitud ${institution.name}.`, "mario", app.advisorUserId);
  await app.db.insert(s.auditEvents).values({
    workspaceId: app.workspaceId,
    customerId: input.customerId,
    actorType: "mario",
    actorId: app.advisorUserId,
    eventType: "credit_application_created",
    entityType: "credit_application",
    entityId: row!.id,
    data: { institution: institution.code },
  });
  await refreshApplicationStatus(app, row!.id);
  return row!;
}

export async function setApplicationStatus(app: AppContext, applicationId: string, to: CreditApplicationStatus, reason: string) {
  const { application } = await loadApplication(app.db, app.workspaceId, applicationId);
  const allowed = MANUAL_TRANSITIONS[application.status] ?? [];
  if (!allowed.includes(to)) {
    throw new ServiceError(`No se puede pasar de "${CREDIT_APPLICATION_STATUS_LABELS[application.status]}" a "${CREDIT_APPLICATION_STATUS_LABELS[to]}".`, 409);
  }
  if (to === "ready_for_signature") {
    const { analysis } = await refreshApplicationStatus(app, applicationId);
    if (analysis.totals.conflicts > 0) throw new ServiceError("Hay conflictos sin resolver.", 409);
  }
  await app.db.update(s.creditApplications).set({ status: to, statusReason: reason || null, updatedAt: new Date() }).where(eq(s.creditApplications.id, applicationId));
  await addEvent(app.db, app.workspaceId, applicationId, application.status, to, reason || "Cambio manual.", "mario", app.advisorUserId);
  await app.db.insert(s.auditEvents).values({
    workspaceId: app.workspaceId,
    customerId: application.customerId,
    actorType: "mario",
    actorId: app.advisorUserId,
    eventType: "credit_application_status",
    entityType: "credit_application",
    entityId: applicationId,
    data: { from: application.status, to },
  });
  if (to === "draft") await refreshApplicationStatus(app, applicationId);
}

export async function listCustomerApplications(app: AppContext, customerId: string) {
  const rows = await app.db
    .select({ application: s.creditApplications, institution: s.creditInstitutions })
    .from(s.creditApplications)
    .innerJoin(s.creditInstitutions, eq(s.creditInstitutions.id, s.creditApplications.institutionId))
    .where(and(eq(s.creditApplications.customerId, customerId), eq(s.creditApplications.workspaceId, app.workspaceId)))
    .orderBy(desc(s.creditApplications.createdAt));
  const { states } = await fieldStatesFor(app.db, customerId);
  return rows.map(({ application, institution }) => {
    const adapter = getAdapter(institution.code);
    const analysis = adapter ? analyzeApplication(adapter, states) : null;
    return { ...application, institutionCode: institution.code, institutionName: institution.name, totals: analysis?.totals ?? null };
  });
}

export async function getApplicationDetail(app: AppContext, applicationId: string) {
  await refreshApplicationStatus(app, applicationId);
  const { application, institution } = await loadApplication(app.db, app.workspaceId, applicationId);
  const adapter = getAdapter(institution.code)!;
  const { states, profile } = await fieldStatesFor(app.db, application.customerId);
  const analysis = analyzeApplication(adapter, states);
  const [template] = application.templateId ? await app.db.select().from(s.applicationTemplates).where(eq(s.applicationTemplates.id, application.templateId)) : [];
  const events = await app.db.select().from(s.creditApplicationEvents).where(eq(s.creditApplicationEvents.applicationId, applicationId)).orderBy(desc(s.creditApplicationEvents.seq));
  const generated = await app.db.select().from(s.generatedDocuments).where(eq(s.generatedDocuments.applicationId, applicationId)).orderBy(desc(s.generatedDocuments.generatedAt));
  return { application, institution, adapter, analysis, profile, template: template ?? null, events, generated };
}

/**
 * Genera un borrador PDF (copia nueva de la plantilla) con SOLO datos confirmados.
 * Registra campos llenados, fuentes, fecha y autor. Nunca marca consentimientos,
 * PEP ni firmas; los conflictos sin resolver quedan vacíos.
 */
export async function generateApplicationPdf(app: AppContext, applicationId: string) {
  const detail = await getApplicationDetail(app, applicationId);
  const { application, analysis, template } = detail;
  if (!template) throw new ServiceError("No hay plantilla activa para esta financiera.");
  const original = await app.storage.get(template.sourceDocument);
  const sha = createHash("sha256").update(original).digest("hex");
  if (sha !== template.sourceDocument.sha256) throw new ServiceError("La plantilla original no coincide con su huella; no se usa.", 409);

  const plan = buildFillPlan(analysis, template.fieldMapping);
  const result = await fillPdf(original, plan.fill, { title: `BORRADOR ${detail.institution.name} — prellenado por Sofía` });
  const ref = await app.storage.put(app.workspaceId, `generated/${application.customerId}`, result.bytes, "application/pdf");
  const filledSlots = new Set(result.filled.map((f) => f.slot));
  const [doc] = await app.db
    .insert(s.generatedDocuments)
    .values({
      workspaceId: app.workspaceId,
      customerId: application.customerId,
      applicationId,
      templateId: template.id,
      storage: ref,
      fieldsFilled: result.filled.map((f) => ({ slot: f.slot, pdfField: f.pdfField, profileKey: f.profileKeys.join("+") })),
      fieldsSkipped: [...plan.skipped, ...result.missingInPdf.map((slot) => ({ slot, reason: "pdf_field_not_found" }))],
      sourcesUsed: result.filled.flatMap((f) =>
        f.factIds.map((factId, i) => ({ factId, profileKey: f.profileKeys[i] ?? f.profileKeys[0] ?? "", sourceLabel: f.sourceLabels[0] ?? null, status: "confirmed" })),
      ),
      generatedBy: app.advisorUserId,
    })
    .returning();
  await app.db.insert(s.auditEvents).values({
    workspaceId: app.workspaceId,
    customerId: application.customerId,
    actorType: "mario",
    actorId: app.advisorUserId,
    eventType: "credit_pdf_generated",
    entityType: "generated_document",
    entityId: doc!.id,
    data: { applicationId, filled: filledSlots.size, skipped: plan.skipped.length },
  });
  return { document: doc!, filled: result.filled.length, skipped: plan.skipped, missingInPdf: result.missingInPdf, totals: analysis.totals };
}

export async function getGeneratedPdf(app: AppContext, documentId: string) {
  const [doc] = await app.db.select().from(s.generatedDocuments).where(and(eq(s.generatedDocuments.id, documentId), eq(s.generatedDocuments.workspaceId, app.workspaceId)));
  if (!doc) throw new ServiceError("Documento no encontrado.", 404);
  return { doc, bytes: await app.storage.get(doc.storage) };
}

export async function applicationsByIds(app: AppContext, ids: string[]) {
  if (!ids.length) return [];
  return app.db.select().from(s.creditApplications).where(inArray(s.creditApplications.id, ids));
}

/**
 * Importa una solicitud previa ya llenada (PDF AcroForm) como FUENTE del perfil.
 * Los choques con datos existentes quedan como conflictos para que Mario decida.
 * El archivo se guarda en almacenamiento privado como documento del expediente.
 */
export async function importPreviousApplication(app: AppContext, input: { customerId: string; institutionCode: string; bytes: Uint8Array }) {
  const { extractProfileEntries } = await import("../credit/import");
  const { recordFacts } = await import("./profile");
  const institution = await institutionByCode(app.db, app.workspaceId, input.institutionCode);
  if (!institution) throw new ServiceError("Financiera no disponible.");
  const adapter = getAdapter(institution.code)!;
  const template = await activeTemplate(app.db, institution.id);
  if (!template) throw new ServiceError("No hay plantilla registrada para leer este formato.");
  let extracted;
  try {
    extracted = await extractProfileEntries(input.bytes, adapter, template.fieldMapping);
  } catch {
    throw new ServiceError("No se pudo leer el PDF (¿es un formulario AcroForm?).");
  }
  const ref = await app.storage.put(app.workspaceId, `imports/${input.customerId}`, input.bytes, "application/pdf");
  const [doc] = await app.db
    .insert(s.documents)
    .values({ workspaceId: app.workspaceId, customerId: input.customerId, docType: "credit_application", status: "needs_review", storageProvider: ref.provider, storageBucket: ref.bucket, storageKey: ref.key, sha256: ref.sha256, sizeBytes: ref.sizeBytes, mimeType: "application/pdf", receivedAt: app.clock.now(), isSensitive: true })
    .returning({ id: s.documents.id });
  const result = await recordFacts(app, {
    customerId: input.customerId,
    entries: extracted.entries.map((e) => ({ key: e.key, value: e.value })),
    sourceType: "credit_application",
    sourceLabel: `Solicitud ${institution.name} (archivo)`,
    sourceRefId: doc!.id,
  });
  return { ...result, read: extracted.entries.length, skippedSlots: extracted.skipped };
}
