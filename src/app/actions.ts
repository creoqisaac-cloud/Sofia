"use server";

/**
 * Server actions de la app operativa. Delgadas: validan entrada y delegan en los
 * servicios (que aplican reglas, auditoría y provenance).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CREDIT_APPLICATION_STATUSES, DOCUMENT_STATUSES, DOCUMENT_TYPES, SALE_STATUSES } from "@/domain/enums";
import { PROFILE_FIELD_DEFS, type ProfileSection } from "@/domain/profile-fields";
import { SALE_FIELDS, type SaleSection } from "@/domain/sales";
import { getAppContext } from "@/server/app";
import { logger } from "@/server/lib/logger";
import { createApplication, generateApplicationPdf, importPreviousApplication, setApplicationStatus } from "@/server/services/credit";
import { createCustomer } from "@/server/services/customers";
import { setDocumentStatus } from "@/server/services/documents";
import { ServiceError } from "@/server/services/errors";
import { decideApproval, updateAlertStatus } from "@/server/services/mario";
import { confirmFact, confirmFacts, recordFacts, resolveConflict } from "@/server/services/profile";
import { attachValidatedQuote, lookupScenario, registerValidatedScenario } from "@/server/services/quotes";
import { createSale, updateSale } from "@/server/services/sales";
import { completeFollowup, createFollowup, markContacted, postponeFollowup, scheduleAppointment, setAppointmentStatus, type AppointmentStatus } from "@/server/services/agenda";
import { cancelDraft, draftPlatesEmail, markOpenedInMail, markSentManually, sendEmail, setPlatesRecipient, updateDraft } from "@/server/services/email";
import { addPlateRequirement, ensurePlateCase, PLATE_STATUSES, removePlateRequirement, setRequirementReceived, updatePlateCase } from "@/server/services/plates";
import { calibrateFinanceProgram, runQuote } from "@/server/services/quote-v2";
import { createReturnCase, setReturnStatus } from "@/server/services/returns";
import { captureFromDocument, reviewFact, setInboxStatus } from "@/server/services/inbox";
import { registerMarioQuote, setCustomerNumber } from "@/server/services/tablet";

export type ActionState = { ok: boolean; message?: string; error?: string; data?: unknown } | null;

async function run(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (error) {
    if (error instanceof ServiceError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: "Datos inválidos." };
    if (error && typeof error === "object" && "digest" in error) throw error; // redirect()
    logger.error("action.error", { error: error instanceof Error ? error.message : String(error) });
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
}

// ───────── clientes y perfil ─────────

export async function createCustomerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string | null = null;
  const res = await run(async () => {
    const app = await getAppContext();
    const name = String(form.get("displayName") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const { customer } = await createCustomer(app, { displayName: name, phone: phone || null });
    if (phone) await recordFacts(app, { customerId: customer.id, entries: [{ key: "mobile_phone", value: phone }], sourceType: "mario_capture", sourceLabel: "Captura de Mario" });
    id = customer.id;
  });
  if (id) redirect(`/customers/${id}`);
  return res;
}

export async function saveProfileSectionAction(customerId: string, section: ProfileSection, _prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const app = await getAppContext();
    const keys = Object.values(PROFILE_FIELD_DEFS)
      .filter((d) => d.section === section)
      .map((d) => d.key as string)
      .filter((k) => form.has(k));
    const res = await recordFacts(app, {
      customerId,
      entries: keys.map((key) => ({ key, value: String(form.get(key) ?? "") })),
      sourceType: "mario_capture",
      sourceLabel: "Captura de Mario",
    });
    revalidatePath(`/customers/${customerId}`, "layout");
    if (res.rejected.length) {
      return { ok: false, error: res.rejected.map((r) => `${PROFILE_FIELD_DEFS[r.key]?.label ?? r.key}: ${r.reason}`).join(" · ") };
    }
    return { ok: true, message: res.conflicts.length ? `Guardado. Conflictos: ${res.conflicts.length}` : "Guardado" };
  });
}

export async function confirmFactAction(customerId: string, factId: string): Promise<ActionState> {
  return run(async () => {
    await confirmFact(await getAppContext(), customerId, factId);
    revalidatePath(`/customers/${customerId}`, "layout");
  });
}

export async function confirmFactsAction(customerId: string, factIds: string[]): Promise<ActionState> {
  return run(async () => {
    const n = await confirmFacts(await getAppContext(), customerId, factIds);
    revalidatePath(`/customers/${customerId}`, "layout");
    return { ok: true, message: `${n} dato(s) confirmados` };
  });
}

export async function resolveConflictAction(customerId: string, key: string, choice: { factId?: string; manualValue?: string }): Promise<ActionState> {
  return run(async () => {
    await resolveConflict(await getAppContext(), { customerId, key, chosenFactId: choice.factId, manualValue: choice.manualValue });
    revalidatePath(`/customers/${customerId}`, "layout");
    return { ok: true, message: "Conflicto resuelto" };
  });
}

// ───────── crédito ─────────

export async function createApplicationAction(customerId: string, institutionCode: string): Promise<ActionState> {
  let id: string | null = null;
  const res = await run(async () => {
    const application = await createApplication(await getAppContext(), { customerId, institutionCode });
    id = application.id;
  });
  if (id) redirect(`/customers/${customerId}/credit/${id}`);
  return res;
}

export async function setApplicationStatusAction(customerId: string, applicationId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const status = z.enum(CREDIT_APPLICATION_STATUSES).parse(form.get("status"));
    await setApplicationStatus(await getAppContext(), applicationId, status, String(form.get("reason") ?? ""));
    revalidatePath(`/customers/${customerId}`, "layout");
    return { ok: true, message: "Estado actualizado" };
  });
}

export async function generatePdfAction(customerId: string, applicationId: string): Promise<ActionState> {
  return run(async () => {
    const res = await generateApplicationPdf(await getAppContext(), applicationId);
    revalidatePath(`/customers/${customerId}`, "layout");
    return { ok: true, message: `Borrador generado: ${res.filled} campos llenados.`, data: { documentId: res.document.id } };
  });
}

export async function importApplicationAction(customerId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const file = form.get("file");
    const institution = String(form.get("institution") ?? "");
    if (!(file instanceof File) || file.size === 0) throw new ServiceError("Selecciona un PDF.");
    if (file.size > 15 * 1024 * 1024) throw new ServiceError("El archivo es demasiado grande.");
    const res = await importPreviousApplication(await getAppContext(), { customerId, institutionCode: institution, bytes: new Uint8Array(await file.arrayBuffer()) });
    revalidatePath(`/customers/${customerId}`, "layout");
    return { ok: true, message: `Leídos ${res.read} datos · nuevos ${res.saved.length} · conflictos ${res.conflicts.length}` };
  });
}

export async function setDocumentStatusAction(customerId: string, docType: string, status: string): Promise<ActionState> {
  return run(async () => {
    await setDocumentStatus(await getAppContext(), customerId, z.enum(DOCUMENT_TYPES).parse(docType), z.enum(DOCUMENT_STATUSES).parse(status));
    revalidatePath(`/customers/${customerId}`, "layout");
  });
}

// ───────── cotizaciones ─────────

export async function lookupScenarioAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const input = z
      .object({ model: z.string().min(1), version: z.string().min(1), downPayment: z.coerce.number().positive(), termMonths: z.coerce.number().int().positive() })
      .parse({ model: form.get("model"), version: form.get("version"), downPayment: String(form.get("downPayment") ?? "").replace(/[^\d.]/g, ""), termMonths: form.get("termMonths") });
    return { ok: true, data: await lookupScenario(await getAppContext(), input) };
  });
}

export async function attachQuoteAction(customerId: string, templateId: string): Promise<ActionState> {
  return run(async () => {
    await attachValidatedQuote(await getAppContext(), customerId, templateId);
    revalidatePath(`/customers/${customerId}`, "layout");
    return { ok: true, message: "Corrida guardada en el cliente" };
  });
}

export async function registerScenarioAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const num = (k: string) => Number(String(form.get(k) ?? "").replace(/[^\d.]/g, ""));
    const input = z
      .object({
        model: z.string().min(1),
        version: z.string().min(1),
        vehiclePrice: z.number().positive(),
        bonus: z.number().min(0),
        downPayment: z.number().positive(),
        termMonths: z.number().int().positive(),
        monthlyPayment: z.number().positive(),
        validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse({ model: form.get("model"), version: form.get("version"), vehiclePrice: num("vehiclePrice"), bonus: num("bonus"), downPayment: num("downPayment"), termMonths: num("termMonths"), monthlyPayment: num("monthlyPayment"), validTo: form.get("validTo") });
    await registerValidatedScenario(await getAppContext(), { ...input, validTo: new Date(`${input.validTo}T23:59:59`), sourceName: "Corrida validada por Mario" });
    return { ok: true, message: "Corrida validada guardada" };
  });
}

// ───────── ventas ─────────

export async function createSaleAction(customerId: string, quoteId: string | null, creditApplicationId: string | null): Promise<ActionState> {
  let id: string | null = null;
  const res = await run(async () => {
    const sale = await createSale(await getAppContext(), { customerId, quoteId, creditApplicationId });
    id = sale.id;
  });
  if (id) redirect(`/sales/${id}`);
  return res;
}

export async function updateSaleSectionAction(saleId: string, section: SaleSection, _prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const patch: Record<string, unknown> = {};
    for (const f of SALE_FIELDS.filter((x) => x.section === section)) if (form.has(f.key)) patch[f.key] = form.get(f.key);
    const res = await updateSale(await getAppContext(), saleId, patch, String(form.get("reason") ?? "") || null);
    revalidatePath(`/sales/${saleId}`);
    revalidatePath("/sales");
    return { ok: true, message: res.changes.length ? `Guardado (${res.changes.length} cambio${res.changes.length === 1 ? "" : "s"})` : "Sin cambios" };
  });
}

export async function setSaleStatusAction(saleId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const status = z.enum(SALE_STATUSES).parse(form.get("status"));
    await updateSale(await getAppContext(), saleId, { status }, String(form.get("reason") ?? "") || null);
    revalidatePath(`/sales/${saleId}`);
    revalidatePath("/sales");
    return { ok: true, message: "Estado actualizado" };
  });
}

// ───────── alertas ─────────

export async function alertStatusAction(alertId: string, status: "acknowledged" | "resolved"): Promise<ActionState> {
  return run(async () => {
    await updateAlertStatus(await getAppContext(), alertId, status);
    revalidatePath("/", "layout");
  });
}

export async function approvalDecisionAction(approvalId: string, decision: "approved" | "rejected"): Promise<ActionState> {
  return run(async () => {
    await decideApproval(await getAppContext(), approvalId, decision, null);
    revalidatePath("/", "layout");
  });
}

// ───────── Sprint 3: seguimiento, citas, placas, correo, devoluciones, cotizador ─────────

export async function followupOpAction(followupId: string, op: "done" | "postpone"): Promise<ActionState> {
  return run(async () => {
    const app = await getAppContext();
    if (op === "done") await completeFollowup(app, followupId);
    else await postponeFollowup(app, followupId, 1);
    revalidatePath("/", "layout");
    return { ok: true, message: op === "done" ? "Hecho" : "Pospuesto a mañana" };
  });
}

export async function contactedAction(customerId: string, followupId: string | null): Promise<ActionState> {
  return run(async () => {
    await markContacted(await getAppContext(), customerId, { followupId });
    revalidatePath("/", "layout");
    return { ok: true, message: "Contacto registrado" };
  });
}

export async function createFollowupAction(customerId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const reason = String(form.get("reason") ?? "").trim();
    const date = String(form.get("date") ?? "");
    const time = String(form.get("time") ?? "10:00");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ServiceError("Elige la fecha.");
    await createFollowup(await getAppContext(), { customerId, dueAt: new Date(`${date}T${time || "10:00"}:00`), reason, action: String(form.get("action") ?? "") || null, promisedByMario: form.get("promise") === "on" });
    revalidatePath("/", "layout");
    return { ok: true, message: "Seguimiento creado" };
  });
}

export async function scheduleAppointmentAction(customerId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const date = String(form.get("date") ?? "");
    const time = String(form.get("time") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new ServiceError("Elige fecha y hora.");
    await scheduleAppointment(await getAppContext(), { customerId, at: new Date(`${date}T${time}:00`), kind: String(form.get("kind") ?? "visit"), location: String(form.get("location") ?? "") || null, notes: String(form.get("notes") ?? "") || null });
    revalidatePath("/", "layout");
    return { ok: true, message: "Cita agendada" };
  });
}

export async function appointmentStatusAction(appointmentId: string, status: AppointmentStatus): Promise<ActionState> {
  return run(async () => {
    await setAppointmentStatus(await getAppContext(), appointmentId, status);
    revalidatePath("/", "layout");
  });
}

export async function plateRequirementAction(caseId: string, requirementId: string, received: boolean): Promise<ActionState> {
  return run(async () => {
    await setRequirementReceived(await getAppContext(), caseId, requirementId, received);
    revalidatePath("/", "layout");
  });
}

export async function plateCaseAction(caseId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const status = z.enum(PLATE_STATUSES).parse(form.get("status"));
    const due = String(form.get("dueDate") ?? "");
    await updatePlateCase(await getAppContext(), caseId, {
      status,
      nextStep: String(form.get("nextStep") ?? "") || null,
      notes: String(form.get("notes") ?? "") || null,
      vin: String(form.get("vin") ?? "").toUpperCase() || null,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T12:00:00`) : null,
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Trámite actualizado" };
  });
}

export async function openPlateCaseAction(customerId: string): Promise<ActionState> {
  let id: string | null = null;
  const res = await run(async () => {
    id = (await ensurePlateCase(await getAppContext(), customerId)).id;
  });
  if (id) redirect(`/plates/${id}`);
  return res;
}

export async function addPlateRequirementAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await addPlateRequirement(await getAppContext(), { label: String(form.get("label") ?? ""), sourceLabel: String(form.get("source") ?? "") });
    revalidatePath("/", "layout");
    return { ok: true, message: "Requisito agregado" };
  });
}

export async function removePlateRequirementAction(id: string): Promise<ActionState> {
  return run(async () => {
    await removePlateRequirement(await getAppContext(), id);
    revalidatePath("/", "layout");
  });
}

export async function platesRecipientAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await setPlatesRecipient(await getAppContext(), String(form.get("email") ?? ""));
    revalidatePath("/", "layout");
    return { ok: true, message: "Guardado" };
  });
}

export async function draftPlatesEmailAction(customerId: string): Promise<ActionState> {
  let id: string | null = null;
  const res = await run(async () => {
    id = (await draftPlatesEmail(await getAppContext(), customerId)).id;
  });
  if (id) redirect(`/emails/${id}`);
  return res;
}

export async function updateEmailAction(emailId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await updateDraft(await getAppContext(), emailId, { toAddress: String(form.get("to") ?? ""), subject: String(form.get("subject") ?? ""), body: String(form.get("body") ?? "") });
    revalidatePath(`/emails/${emailId}`);
    return { ok: true, message: "Borrador guardado" };
  });
}

/** Guardar el texto visible y enviar exactamente esa versión, tras confirmación en pantalla. */
export async function updateAndSendEmailAction(emailId: string, payload: { to: string; subject: string; body: string }): Promise<ActionState> {
  return run(async () => {
    const fields = z.object({
      to: z.string().email(),
      subject: z.string().min(1).max(250),
      body: z.string().min(1).max(15000),
    }).parse(payload);
    const app = await getAppContext();
    await updateDraft(app, emailId, { toAddress: fields.to, subject: fields.subject, body: fields.body });
    await sendEmail(app, emailId, { confirmed: true });
    revalidatePath(`/emails/${emailId}`);
    return { ok: true, message: "Correo guardado y enviado con tu confirmación" };
  });
}

export async function emailOpAction(emailId: string, op: "send" | "cancel" | "opened" | "remove_attachment" | "mark_sent", arg?: string): Promise<ActionState> {
  return run(async () => {
    const app = await getAppContext();
    if (op === "send") await sendEmail(app, emailId, { confirmed: true });
    else if (op === "mark_sent") await markSentManually(app, emailId);
    else if (op === "cancel") await cancelDraft(app, emailId);
    else if (op === "opened") await markOpenedInMail(app, emailId);
    else if (op === "remove_attachment" && arg) await updateDraft(app, emailId, { removeAttachmentId: arg });
    revalidatePath(`/emails/${emailId}`);
    return { ok: true, message: op === "send" ? "Correo enviado" : op === "mark_sent" ? "Marcado como enviado" : op === "cancel" ? "Borrador cancelado" : "Listo" };
  });
}

export async function createReturnAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const customerId = z.string().uuid().parse(form.get("customerId"));
    const amount = String(form.get("amount") ?? "").replace(/[^\d.]/g, "");
    await createReturnCase(await getAppContext(), { customerId, reason: String(form.get("reason") ?? ""), notes: String(form.get("notes") ?? ""), amount: amount ? Number(amount) : null });
    revalidatePath("/returns");
    return { ok: true, message: "Registrada" };
  });
}

export async function returnStatusAction(id: string, status: "open" | "resolved" | "cancelled"): Promise<ActionState> {
  return run(async () => {
    await setReturnStatus(await getAppContext(), id, status);
    revalidatePath("/returns");
  });
}

export async function calibrateProgramAction(programId: string): Promise<ActionState> {
  return run(async () => {
    const r = await calibrateFinanceProgram(await getAppContext(), programId);
    revalidatePath("/programs");
    return { ok: true, message: r.summary };
  });
}

export async function quoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const input = z
      .object({ model: z.string().min(1), version: z.string().min(1), downPayment: z.coerce.number().min(0), termMonths: z.coerce.number().int().positive() })
      .parse({ model: form.get("model"), version: form.get("version"), downPayment: String(form.get("downPayment") ?? "").replace(/[^\d.]/g, ""), termMonths: form.get("termMonths") });
    return { ok: true, data: await runQuote(await getAppContext(), input) };
  });
}

// ───────── Piloto tablet: documentos, cotización de Mario, número de cliente ─────────

export async function reviewDocFactAction(customerId: string, documentId: string, factId: string, action: "confirm" | "ignore" | "correct", value?: string): Promise<ActionState> {
  return run(async () => {
    await reviewFact(await getAppContext(), { customerId, documentId, factId, action, value });
    revalidatePath(`/customers/${customerId}`, "layout");
    return { ok: true, message: action === "confirm" ? "Confirmado" : action === "ignore" ? "Ignorado" : "Corregido" };
  });
}

export async function captureFromDocAction(customerId: string, documentId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await captureFromDocument(await getAppContext(), { customerId, documentId, key: String(form.get("key") ?? ""), value: String(form.get("value") ?? "") });
    revalidatePath(`/customers/${customerId}`, "layout");
    return { ok: true, message: "Guardado y confirmado" };
  });
}

export async function inboxStatusAction(customerId: string, documentId: string, status: "confirmed" | "rejected"): Promise<ActionState> {
  return run(async () => {
    await setInboxStatus(await getAppContext(), documentId, status);
    revalidatePath(`/customers/${customerId}`, "layout");
    return { ok: true, message: status === "confirmed" ? "Documento revisado" : "Documento rechazado" };
  });
}

export async function registerMarioQuoteAction(customerId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const num = (k: string) => {
      const v = String(form.get(k) ?? "").replace(/[^\d.]/g, "");
      return v ? Number(v) : null;
    };
    const model = String(form.get("model") ?? "");
    if (!model) throw new ServiceError("Elige el modelo.");
    await registerMarioQuote(await getAppContext(), { customerId, model, version: String(form.get("version") ?? "") || null, downPayment: num("downPayment") ?? 0, termMonths: num("termMonths"), monthlyPayment: num("monthlyPayment"), vehiclePrice: num("vehiclePrice") });
    revalidatePath(`/customers/${customerId}`, "layout");
    return { ok: true, message: "Cotización guardada. Quedó un seguimiento para dentro de 2 días." };
  });
}

export async function customerNumberAction(customerId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await setCustomerNumber(await getAppContext(), customerId, String(form.get("customerNumber") ?? ""));
    revalidatePath(`/customers/${customerId}`, "layout");
    return { ok: true, message: "Guardado" };
  });
}
