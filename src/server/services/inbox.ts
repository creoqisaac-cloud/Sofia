/**
 * Bandeja de documentos del cliente (tablet): subir → extraer (sin IA) → hechos OBSERVADOS →
 * revisión de Mario (Confirmar / Corregir / Ignorar) → datos CONFIRMADOS → solicitud.
 *
 * Nada leído de un documento entra como confirmado. Archivos en almacenamiento privado
 * (nunca /public ni git); en logs no van nombres de archivo ni valores.
 */
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES, type DocumentType } from "@/domain/enums";
import { FACT_DEFS, formatFactValue, isFactKey } from "@/domain/facts";
import type { AppContext } from "../app";
import * as s from "../db/schema";
import { isEncryptedPdf, runExtraction, sniffMime, type ExtractionProvider } from "../extraction";
import type { DocumentObservation } from "../extraction/observation";
import { recordAiUsage } from "./ai-usage";
import { ServiceError } from "./errors";
import { confirmFact, ignoreFact, recordFacts } from "./profile";

export const INBOX_STATUSES = ["uploaded", "processing", "observed", "needs_review", "confirmed", "rejected"] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];
export const INBOX_STATUS_LABELS: Record<InboxStatus, string> = {
  uploaded: "Subido",
  processing: "Leyendo…",
  observed: "Datos por revisar",
  needs_review: "Revisar a mano",
  confirmed: "Revisado",
  rejected: "Rechazado",
};
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

async function customerOrThrow(app: AppContext, customerId: string) {
  const [c] = await app.db.select().from(s.customers).where(and(eq(s.customers.id, customerId), eq(s.customers.workspaceId, app.workspaceId)));
  if (!c) throw new ServiceError("Cliente no encontrado.", 404);
  return c;
}

export async function uploadDocument(
  app: AppContext,
  input: { customerId: string; bytes: Uint8Array; fileName: string; docType: string; observation?: DocumentObservation },
  providers?: ExtractionProvider[],
) {
  await customerOrThrow(app, input.customerId);
  if (input.bytes.byteLength === 0) throw new ServiceError("El archivo está vacío.");
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) throw new ServiceError("El archivo pesa más de 15 MB.");
  const mime = sniffMime(input.bytes);
  if (!mime) throw new ServiceError("Solo se aceptan PDF, JPG o PNG.");
  if (mime === "application/pdf" && (await isEncryptedPdf(input.bytes))) throw new ServiceError("El PDF tiene contraseña. Súbelo sin protección.");
  const docType = (DOCUMENT_TYPES as readonly string[]).includes(input.docType) ? (input.docType as DocumentType) : "other";
  const ref = await app.storage.put(app.workspaceId, `customers/${input.customerId}`, input.bytes, mime);
  const now = app.clock.now();
  const [doc] = await app.db
    .insert(s.documents)
    .values({
      workspaceId: app.workspaceId,
      customerId: input.customerId,
      docType,
      status: "received",
      isSensitive: true,
      storageProvider: ref.provider,
      storageBucket: ref.bucket,
      storageKey: ref.key,
      mimeType: mime,
      sizeBytes: ref.sizeBytes,
      sha256: ref.sha256,
      receivedAt: now,
      fileName: input.fileName.slice(0, 120) || null,
      extractionStatus: "uploaded",
    })
    .returning();
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "document_uploaded", entityType: "document", entityId: doc!.id, customerId: input.customerId, data: { docType, mime, sizeBytes: ref.sizeBytes, scanned: Boolean(input.observation), pages: input.observation?.pages.length } });
  await processDocument(app, doc!.id, input.bytes, providers, input.observation);
  return (await getInboxDocument(app, doc!.id)).doc;
}

/**
 * Lee el documento y registra lo encontrado como OBSERVADO (con documento, fuente, confianza y fecha).
 * `observation`: OCR estructurado hecho en la tablet (escáner nativo). No se guarda (es PII derivada).
 */
export async function processDocument(app: AppContext, documentId: string, bytes?: Uint8Array, providers?: ExtractionProvider[], observation?: DocumentObservation) {
  const [doc] = await app.db.select().from(s.documents).where(and(eq(s.documents.id, documentId), eq(s.documents.workspaceId, app.workspaceId)));
  if (!doc) throw new ServiceError("Documento no encontrado.", 404);
  await app.db.update(s.documents).set({ extractionStatus: "processing", updatedAt: new Date() }).where(eq(s.documents.id, documentId));
  const data = bytes ?? (await app.storage.get({ bucket: doc.storageBucket!, key: doc.storageKey! }));
  const started = Date.now();
  const result = await runExtraction({ bytes: data, mime: doc.mimeType ?? "", docType: doc.docType, observation }, providers);
  if (result.provider !== "manual" && providers?.find((p) => p.name === result.provider)?.kind === "external") {
    await recordAiUsage(app, { provider: result.provider, purpose: "extraction", ok: true, durationMs: Date.now() - started });
  }
  let status: InboxStatus = "needs_review";
  let note = result.note;
  if (result.fields.length) {
    const date = app.clock.now().toLocaleDateString("es-MX");
    const res = await recordFacts(app, {
      customerId: doc.customerId,
      entries: result.fields.map((f) => ({ key: f.key, value: f.value, confidence: f.confidence })),
      sourceType: "document",
      sourceLabel: `${DOCUMENT_TYPE_LABELS[doc.docType as DocumentType] ?? "Documento"} (${result.provider === "ocr-dispositivo" ? "escaneado en la tablet" : "subido"} ${date})`,
      sourceRefId: doc.id,
    });
    const pending = await pendingFacts(app, doc.id);
    status = pending.length ? "observed" : "confirmed";
    if (!pending.length) note = `${note} Todo coincide con datos ya confirmados.`;
    if (res.conflicts.length) note = `${note} ${res.conflicts.length} dato(s) no coinciden con lo que ya tenías: revísalos.`;
  }
  await app.db.update(s.documents).set({ extractionStatus: status, extractionProvider: result.provider, extractionNote: note, updatedAt: new Date() }).where(eq(s.documents.id, documentId));
}

async function pendingFacts(app: AppContext, documentId: string) {
  return app.db
    .select()
    .from(s.customerFacts)
    .where(and(eq(s.customerFacts.sourceRefId, documentId), eq(s.customerFacts.workspaceId, app.workspaceId), inArray(s.customerFacts.status, ["observed", "conflicting"])));
}

/** Tras cada revisión: si ya no queda nada por revisar, el documento pasa a "Revisado". */
async function refreshDocStatus(app: AppContext, documentId: string) {
  const [doc] = await app.db.select().from(s.documents).where(eq(s.documents.id, documentId));
  if (!doc || doc.extractionStatus === "rejected") return;
  const pending = await pendingFacts(app, documentId);
  const next: InboxStatus = pending.length ? "observed" : "confirmed";
  if (doc.extractionStatus !== next) await app.db.update(s.documents).set({ extractionStatus: next, updatedAt: new Date() }).where(eq(s.documents.id, documentId));
}

export async function getInboxDocument(app: AppContext, documentId: string) {
  const [doc] = await app.db.select().from(s.documents).where(and(eq(s.documents.id, documentId), eq(s.documents.workspaceId, app.workspaceId)));
  if (!doc) throw new ServiceError("Documento no encontrado.", 404);
  const facts = await app.db.select().from(s.customerFacts).where(and(eq(s.customerFacts.sourceRefId, documentId), eq(s.customerFacts.workspaceId, app.workspaceId))).orderBy(s.customerFacts.createdAt);
  return {
    doc,
    facts: facts.map((f) => ({
      id: f.id,
      key: f.factKey,
      label: isFactKey(f.factKey) ? FACT_DEFS[f.factKey].label : f.factKey,
      value: isFactKey(f.factKey) ? formatFactValue(f.factKey, f.value as Parameters<typeof formatFactValue>[1]) : String(f.value),
      status: f.status,
      confidence: f.confidence,
      source: f.source,
      sourceLabel: f.sourceLabel,
      createdAt: f.createdAt,
    })),
  };
}

export async function listInbox(app: AppContext, customerId: string) {
  await customerOrThrow(app, customerId);
  const docs = await app.db
    .select()
    .from(s.documents)
    .where(and(eq(s.documents.customerId, customerId), eq(s.documents.workspaceId, app.workspaceId), isNotNull(s.documents.storageKey)))
    .orderBy(desc(s.documents.createdAt));
  const ids = docs.map((d) => d.id);
  const facts = ids.length ? await app.db.select({ ref: s.customerFacts.sourceRefId, status: s.customerFacts.status }).from(s.customerFacts).where(inArray(s.customerFacts.sourceRefId, ids)) : [];
  return docs.map((d) => ({
    ...d,
    pendingReview: facts.filter((f) => f.ref === d.id && (f.status === "observed" || f.status === "conflicting")).length,
    foundCount: facts.filter((f) => f.ref === d.id).length,
  }));
}

export async function inboxSummary(app: AppContext, customerId: string) {
  const docs = await listInbox(app, customerId);
  return { total: docs.length, pendingReview: docs.reduce((n, d) => n + d.pendingReview, 0), needsManual: docs.filter((d) => d.extractionStatus === "needs_review").length };
}

export async function reviewFact(app: AppContext, input: { customerId: string; documentId: string; factId: string; action: "confirm" | "ignore" | "correct"; value?: string }) {
  const [fact] = await app.db.select().from(s.customerFacts).where(and(eq(s.customerFacts.id, input.factId), eq(s.customerFacts.sourceRefId, input.documentId), eq(s.customerFacts.customerId, input.customerId)));
  if (!fact) throw new ServiceError("Dato no encontrado.", 404);
  if (input.action === "confirm") await confirmFact(app, input.customerId, input.factId);
  else if (input.action === "ignore") await ignoreFact(app, input.customerId, input.factId);
  else {
    const value = (input.value ?? "").trim();
    if (!value) throw new ServiceError("Escribe el valor correcto.");
    const res = await recordFacts(app, { customerId: input.customerId, entries: [{ key: fact.factKey, value }], sourceType: "mario_capture", sourceLabel: "Corregido por Mario (documento)", sourceRefId: input.documentId });
    if (res.rejected.length) throw new ServiceError(`${FACT_DEFS[fact.factKey as keyof typeof FACT_DEFS]?.label ?? fact.factKey}: ${res.rejected[0]!.reason}`);
    // El valor leído queda en el historial, ya no vigente.
    const [still] = await app.db.select().from(s.customerFacts).where(eq(s.customerFacts.id, input.factId));
    if (still && (still.status === "observed" || still.status === "conflicting")) await ignoreFact(app, input.customerId, input.factId);
  }
  await refreshDocStatus(app, input.documentId);
}

/** Captura manual desde un documento (foto sin OCR, escaneado…): lo que Mario escribe queda confirmado y ligado al documento. */
export async function captureFromDocument(app: AppContext, input: { customerId: string; documentId: string; key: string; value: string }) {
  const { doc } = await getInboxDocument(app, input.documentId);
  if (doc.customerId !== input.customerId) throw new ServiceError("El documento no es de este cliente.", 409);
  if (!isFactKey(input.key)) throw new ServiceError("Campo desconocido.");
  const res = await recordFacts(app, { customerId: input.customerId, entries: [{ key: input.key, value: input.value }], sourceType: "mario_capture", sourceLabel: "Capturado por Mario (documento)", sourceRefId: input.documentId });
  if (res.rejected.length) throw new ServiceError(`${FACT_DEFS[input.key].label}: ${res.rejected[0]!.reason}`);
  await refreshDocStatus(app, input.documentId);
}

export async function setInboxStatus(app: AppContext, documentId: string, status: "confirmed" | "rejected") {
  const { doc, facts } = await getInboxDocument(app, documentId);
  if (status === "rejected") {
    for (const f of facts.filter((x) => x.status === "observed" || x.status === "conflicting")) await ignoreFact(app, doc.customerId, f.id);
    await app.db.update(s.documents).set({ extractionStatus: "rejected", status: "rejected", updatedAt: new Date() }).where(eq(s.documents.id, documentId));
  } else {
    await app.db.update(s.documents).set({ extractionStatus: "confirmed", status: "accepted", updatedAt: new Date() }).where(eq(s.documents.id, documentId));
  }
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "document_review", entityType: "document", entityId: documentId, customerId: doc.customerId, data: { status } });
}

export async function readDocumentFile(app: AppContext, documentId: string) {
  const [doc] = await app.db.select().from(s.documents).where(and(eq(s.documents.id, documentId), eq(s.documents.workspaceId, app.workspaceId)));
  if (!doc?.storageKey || !doc.storageBucket) throw new ServiceError("Documento no encontrado.", 404);
  return { bytes: await app.storage.get({ bucket: doc.storageBucket, key: doc.storageKey }), mime: doc.mimeType ?? "application/octet-stream", doc };
}
