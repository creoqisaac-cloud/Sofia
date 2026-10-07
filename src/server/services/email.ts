/**
 * Correos: Sofía prepara borradores; enviar SIEMPRE requiere confirmación explícita de Mario
 * y una cuenta de correo asignada (Más → Correo de Sofía). Sin cuenta, el borrador funciona
 * completo y puede abrirse en la app de correo o compartirse (lo envía Mario).
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { DOCUMENT_TYPE_LABELS } from "@/domain/enums";
import type { AppContext } from "../app";
import * as s from "../db/schema";
import { DAY_MS } from "../lib/clock";
import { createFollowup } from "./agenda";
import { createTransport, friendlySmtpError, loadSmtpConfig, type SmtpConfig } from "./email-account";
import { ServiceError } from "./errors";
import { ensurePlateCase } from "./plates";

export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  send(msg: { to: string; subject: string; body: string; attachments: Array<{ filename: string; bytes: Uint8Array }> }): Promise<{ messageId: string }>;
}

/** Proveedor por defecto: no hay cuenta configurada, así que nunca envía. */
export class DemoEmailProvider implements EmailProvider {
  readonly name = "demo";
  readonly configured = false;
  async send(): Promise<{ messageId: string }> {
    throw new ServiceError(EMAIL_NOT_CONFIGURED, 409);
  }
}

export const EMAIL_NOT_CONFIGURED =
  "Falta configurar la cuenta de correo de Mario para enviar desde Sofía. El borrador está listo: puedes abrirlo en Mail y enviarlo tú.";

/** Envía con la cuenta SMTP que Mario asignó a Sofía. */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  readonly configured = true;
  constructor(private readonly cfg: SmtpConfig) {}
  async send(msg: { to: string; subject: string; body: string; attachments: Array<{ filename: string; bytes: Uint8Array }> }) {
    try {
      const info = await createTransport(this.cfg).sendMail({
        from: { name: this.cfg.displayName, address: this.cfg.address },
        to: msg.to,
        subject: msg.subject,
        text: msg.body,
        attachments: msg.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.bytes) })),
      });
      return { messageId: String(info.messageId ?? "") };
    } catch (e) {
      throw new ServiceError(friendlySmtpError(e), 502);
    }
  }
}

let override: EmailProvider | null = null;
/** Solo para pruebas: fuerza un proveedor. null = usar la cuenta asignada. */
export function setEmailProvider(p: EmailProvider | null) {
  override = p instanceof DemoEmailProvider ? null : p;
}

/** Proveedor vigente: la cuenta asignada a Sofía, o el demo (no envía). */
export async function resolveEmailProvider(app: AppContext): Promise<EmailProvider> {
  if (override) return override;
  const cfg = await loadSmtpConfig(app);
  return cfg ? new SmtpEmailProvider(cfg) : new DemoEmailProvider();
}

export async function emailConfigured(app: AppContext): Promise<boolean> {
  return (await resolveEmailProvider(app)).configured;
}

const extFor = (mime: string | null) => (mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "bin");

async function workspaceSettings(app: AppContext) {
  const [ws] = await app.db.select().from(s.workspaces).where(eq(s.workspaces.id, app.workspaceId));
  return (ws?.settings ?? {}) as Record<string, unknown>;
}

export async function setPlatesRecipient(app: AppContext, email: string) {
  const value = email.trim();
  if (value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) throw new ServiceError("Correo inválido.");
  const settings = await workspaceSettings(app);
  await app.db.update(s.workspaces).set({ settings: { ...settings, platesEmailTo: value || null } }).where(eq(s.workspaces.id, app.workspaceId));
}

export async function getPlatesRecipient(app: AppContext): Promise<string | null> {
  return ((await workspaceSettings(app)).platesEmailTo as string | undefined) ?? null;
}

/** Borrador del correo de placas, armado SOLO con datos registrados (sin inventar requisitos). */
export async function draftPlatesEmail(app: AppContext, customerId: string) {
  const pc = await ensurePlateCase(app, customerId);
  const [customer] = await app.db.select().from(s.customers).where(eq(s.customers.id, customerId));
  const [sale] = pc.saleId ? await app.db.select().from(s.saleRecords).where(eq(s.saleRecords.id, pc.saleId)) : [];
  const docs = await app.db
    .select()
    .from(s.documents)
    .where(and(eq(s.documents.customerId, customerId), inArray(s.documents.status, ["accepted", "received"])));
  const attachments = docs.filter((d) => d.docType !== "credit_application" && d.storageKey).map((d) => ({ documentId: d.id, label: DOCUMENT_TYPE_LABELS[d.docType] ?? d.docType }));
  const received = pc.requirements.filter((r) => r.received).map((r) => r.label);
  const missing = pc.requirements.filter((r) => !r.received).map((r) => r.label);
  const name = customer!.displayName;
  const unit = pc.vehicleLabel ?? sale?.unitDescription ?? "unidad por confirmar";
  const lines = [
    "Hola,",
    "",
    "Te comparto la información para el trámite de placas:",
    "",
    `Cliente: ${name}`,
    `Unidad: ${unit}`,
    `VIN: ${pc.vin ?? sale?.vin ?? "pendiente"}`,
    `Factura: ${sale?.invoiceNumber ?? "pendiente"}`,
    "",
  ];
  if (pc.requirements.length === 0) lines.push("(Requisitos de placas pendientes de capturar por Mario.)", "");
  if (received.length) lines.push("Documentos que ya tengo:", ...received.map((r) => `- ${r}`), "");
  if (missing.length) lines.push("Pendientes:", ...missing.map((r) => `- ${r}`), "");
  if (attachments.length) lines.push(`Adjunto: ${attachments.map((a) => a.label).join(", ")}.`, "");
  lines.push("Quedo atento.", "", "Mario Abarca");
  const [draft] = await app.db
    .insert(s.emailMessages)
    .values({
      workspaceId: app.workspaceId,
      customerId,
      plateCaseId: pc.id,
      saleId: pc.saleId,
      purpose: "plates",
      toAddress: await getPlatesRecipient(app),
      subject: `Trámite de placas — ${name} — ${unit}`,
      body: lines.join("\n"),
      attachments,
      createdBy: "sofia",
    })
    .returning();
  return draft!;
}

export async function getEmail(app: AppContext, id: string) {
  const [e] = await app.db.select().from(s.emailMessages).where(and(eq(s.emailMessages.id, id), eq(s.emailMessages.workspaceId, app.workspaceId)));
  if (!e) throw new ServiceError("Correo no encontrado.", 404);
  return e;
}

export async function updateDraft(app: AppContext, id: string, patch: { toAddress?: string | null; subject?: string; body?: string; removeAttachmentId?: string }) {
  const e = await getEmail(app, id);
  if (e.status !== "draft") throw new ServiceError("Solo se editan borradores.", 409);
  const attachments = patch.removeAttachmentId ? e.attachments.filter((a) => a.documentId !== patch.removeAttachmentId) : e.attachments;
  await app.db
    .update(s.emailMessages)
    .set({ toAddress: patch.toAddress === undefined ? e.toAddress : patch.toAddress?.trim() || null, subject: patch.subject ?? e.subject, body: patch.body ?? e.body, attachments, updatedAt: app.clock.now() })
    .where(eq(s.emailMessages.id, id));
}

export async function cancelDraft(app: AppContext, id: string) {
  const e = await getEmail(app, id);
  if (e.status !== "draft") throw new ServiceError("Solo se cancelan borradores.", 409);
  await app.db.update(s.emailMessages).set({ status: "cancelled", updatedAt: app.clock.now() }).where(eq(s.emailMessages.id, id));
}

/** Mario lo abrió en su app Mail: lo envía él; aquí solo queda registro. */
export async function markOpenedInMail(app: AppContext, id: string) {
  const e = await getEmail(app, id);
  if (e.status === "draft") await app.db.update(s.emailMessages).set({ status: "opened_in_mail", updatedAt: app.clock.now() }).where(eq(s.emailMessages.id, id));
}

/** Enviar exige confirmación explícita. Nunca se llama automáticamente. */
export async function sendEmail(app: AppContext, id: string, opts: { confirmed: boolean }) {
  if (opts.confirmed !== true) throw new ServiceError("Enviar un correo requiere tu confirmación.", 409);
  const e = await getEmail(app, id);
  if (e.status !== "draft") throw new ServiceError("Este correo ya no es un borrador.", 409);
  if (!e.toAddress) throw new ServiceError("Falta el destinatario.", 409);
  const p = await resolveEmailProvider(app);
  if (!p.configured) throw new ServiceError(EMAIL_NOT_CONFIGURED, 409);
  const files: Array<{ filename: string; bytes: Uint8Array }> = [];
  for (const a of e.attachments) {
    const [doc] = await app.db.select().from(s.documents).where(and(eq(s.documents.id, a.documentId), eq(s.documents.customerId, e.customerId!)));
    if (doc?.storageKey && doc.storageBucket) files.push({ filename: `${a.label}.${extFor(doc.mimeType)}`, bytes: await app.storage.get({ bucket: doc.storageBucket, key: doc.storageKey }) });
  }
  try {
    const res = await p.send({ to: e.toAddress, subject: e.subject, body: e.body, attachments: files });
    await app.db.update(s.emailMessages).set({ status: "sent", provider: p.name, providerMessageId: res.messageId, sentAt: app.clock.now(), updatedAt: app.clock.now() }).where(eq(s.emailMessages.id, id));
  } catch (err) {
    await app.db.update(s.emailMessages).set({ status: "failed", provider: p.name, error: err instanceof Error ? err.message : "error", updatedAt: app.clock.now() }).where(eq(s.emailMessages.id, id));
    throw err;
  }
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "email_sent", entityType: "email", entityId: id, customerId: e.customerId, data: { purpose: e.purpose, attachments: e.attachments.length } });
  await afterPlatesEmailSent(app, e);
}

/** Correo de placas enviado: el trámite pasa a "enviado" y queda un recordatorio para revisar la respuesta. */
async function afterPlatesEmailSent(app: AppContext, e: typeof s.emailMessages.$inferSelect) {
  if (e.purpose !== "plates" || !e.plateCaseId || !e.customerId) return;
  const [pc] = await app.db.select().from(s.plateCases).where(eq(s.plateCases.id, e.plateCaseId));
  if (pc && ["not_started", "collecting_documents", "ready"].includes(pc.status)) {
    await app.db.update(s.plateCases).set({ status: "submitted", nextStep: "Esperar respuesta del gestor de placas", updatedAt: app.clock.now() }).where(eq(s.plateCases.id, pc.id));
  }
  await createFollowup(app, { customerId: e.customerId, dueAt: new Date(app.clock.now().getTime() + 2 * DAY_MS), reason: "Revisar respuesta del trámite de placas", action: "Revisar correo de placas" });
}

export async function listEmails(app: AppContext, opts: { customerId?: string } = {}) {
  const conds = [eq(s.emailMessages.workspaceId, app.workspaceId)];
  if (opts.customerId) conds.push(eq(s.emailMessages.customerId, opts.customerId));
  return app.db.select().from(s.emailMessages).where(and(...conds)).orderBy(desc(s.emailMessages.createdAt)).limit(30);
}

/** Mario lo envió desde su correo (compartir / app de correo): se registra como enviado, sin proveedor. */
export async function markSentManually(app: AppContext, id: string) {
  const e = await getEmail(app, id);
  if (!["draft", "opened_in_mail"].includes(e.status)) throw new ServiceError("Este correo ya no está pendiente.", 409);
  await app.db.update(s.emailMessages).set({ status: "sent", provider: "manual", sentAt: app.clock.now(), updatedAt: app.clock.now() }).where(eq(s.emailMessages.id, id));
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "email_marked_sent", entityType: "email", entityId: id, customerId: e.customerId, data: { purpose: e.purpose } });
  await afterPlatesEmailSent(app, e);
}
