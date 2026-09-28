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
