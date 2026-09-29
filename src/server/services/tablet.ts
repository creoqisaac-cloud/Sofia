/**
 * Piloto tablet: vistas resumidas y operaciones de Mario (todo determinista, sin IA).
 *
 * Cambio de producto: Sofía NO cotiza. Mario manda sus cotizaciones (cotizador Honda);
 * aquí solo se registran, se ligan al cliente y disparan el seguimiento.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { CREDIT_APPLICATION_STATUS_LABELS, type CreditApplicationStatus } from "@/domain/enums";
import { formatMXN } from "@/domain/money";
import type { AppContext } from "../app";
import { findVehicle, findVersion, loadCatalog } from "../commercial/catalog";
import * as s from "../db/schema";
import { DAY_MS } from "../lib/clock";
import { createFollowup, getFollowupSummary, RESPONSE_STATUS_LABELS } from "./agenda";
import { getDocumentChecklist } from "./documents";
import { ServiceError } from "./errors";
import { inboxSummary } from "./inbox";

const fmtDay = (d: Date | null | undefined, time = false) =>
  d ? d.toLocaleString("es-MX", time ? { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false } : { weekday: "short", day: "numeric", month: "short" }) : null;

export async function setCustomerNumber(app: AppContext, customerId: string, value: string) {
  const v = value.trim().slice(0, 40) || null;
  const res = await app.db.update(s.customers).set({ customerNumber: v, updatedAt: app.clock.now() }).where(and(eq(s.customers.id, customerId), eq(s.customers.workspaceId, app.workspaceId))).returning({ id: s.customers.id });
  if (!res.length) throw new ServiceError("Cliente no encontrado.", 404);
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "customer_number_set", entityType: "customer", entityId: customerId, customerId });
}

/** Resumen operativo para entender a un cliente en < 10 s. */
export async function getTabletSummary(app: AppContext, customerId: string) {
  const now = app.clock.now();
  const [customer] = await app.db.select().from(s.customers).where(and(eq(s.customers.id, customerId), eq(s.customers.workspaceId, app.workspaceId)));
  if (!customer) throw new ServiceError("Cliente no encontrado.", 404);
  const [[profile], [sale], quotes, apps, appts, fu, checklist, inbox] = await Promise.all([
    app.db.select().from(s.customerProfiles).where(eq(s.customerProfiles.customerId, customerId)),
    app.db.select().from(s.saleRecords).where(eq(s.saleRecords.customerId, customerId)).orderBy(desc(s.saleRecords.createdAt)).limit(1),
    app.db.select().from(s.quotes).where(eq(s.quotes.customerId, customerId)).orderBy(desc(s.quotes.createdAt)).limit(5),
    app.db
      .select({ a: s.creditApplications, inst: s.creditInstitutions.name })
      .from(s.creditApplications)
      .innerJoin(s.creditInstitutions, eq(s.creditInstitutions.id, s.creditApplications.institutionId))
      .where(eq(s.creditApplications.customerId, customerId))
      .orderBy(desc(s.creditApplications.createdAt)),
    app.db.select().from(s.appointments).where(and(eq(s.appointments.customerId, customerId), inArray(s.appointments.status, ["scheduled", "confirmed"]))).orderBy(s.appointments.scheduledAt),
    getFollowupSummary(app, customerId),
    getDocumentChecklist(app, customerId),
    inboxSummary(app, customerId),
  ]);
  const d = (profile?.data ?? {}) as Record<string, unknown>;
  const catalog = await loadCatalog(app.db, app.workspaceId);
  const mario = quotes.find((q) => q.calculationType === "official") ?? null;
  const quoteLine = mario
    ? `${catalog.vehicles.find((v) => v.id === mario.vehicleId)?.model ?? ""} ${catalog.versions.find((v) => v.id === mario.versionId)?.name ?? ""} · ${formatMXN(mario.downPayment)} de enganche${mario.termMonths ? ` · ${mario.termMonths} meses` : ""}${mario.monthlyPayment ? ` · ${formatMXN(mario.monthlyPayment)}/mes` : ""} · enviada ${fmtDay(mario.createdAt)}`.replace(/\s+/g, " ").trim()
    : null;
  const pay = d.payment_method === "financing" ? "a crédito" : d.payment_method === "cash" ? "de contado" : null;
  const need = [d.vehicle_interest, d.version].filter(Boolean).join(" ") || null;
  const activeApp = apps.find(({ a }) => !["cancelled", "rejected"].includes(a.status));
  const missingDocs = checklist.filter((c) => c.requiredBy.length > 0 && ["missing", "requested", "rejected"].includes(c.status));
  const waiting: string[] = [];
  if (fu.responseStatus !== "none") waiting.push(RESPONSE_STATUS_LABELS[fu.responseStatus]!);
  if (activeApp) waiting.push(`Solicitud ${activeApp.inst}: ${CREDIT_APPLICATION_STATUS_LABELS[activeApp.a.status as CreditApplicationStatus]}`);
  if (missingDocs.length) waiting.push(`Faltan ${missingDocs.length} documento(s)`);
  if (inbox.pendingReview) waiting.push(`${inbox.pendingReview} dato(s) de documentos por revisar`);
  const nextAppt = appts.find((a) => a.scheduledAt && a.scheduledAt >= new Date(now.getTime() - 2 * 3_600_000));
  return {
    customer,
    customerNumber: customer.customerNumber ?? sale?.customerNumber ?? null,
    phone: (d.mobile_phone as string | undefined) ?? customer.phone ?? null,
    need: need ? `${need}${pay ? ` ${pay}` : ""}` : pay ? `Auto ${pay}` : null,
    quote: quoteLine,
    hasMarioQuote: Boolean(mario),
    lastContact: fmtDay(fu.lastContactAt),
    waitingFor: waiting.length ? waiting.join(" · ") : null,
    nextAction: fu.next ? { text: fu.next.reason, when: fmtDay(fu.next.dueAt, true), overdue: Boolean(fu.next.dueAt && fu.next.dueAt < now), id: fu.next.id, action: fu.next.action } : null,
    appointment: nextAppt ? { when: fmtDay(nextAppt.scheduledAt, true), id: nextAppt.id } : null,
    applications: apps.map(({ a, inst }) => ({ id: a.id, institution: inst, status: a.status as CreditApplicationStatus })),
    inbox,
    missingDocs: missingDocs.map((m) => m.label),
  };
}

/** Todas las solicitudes (para la pestaña Solicitudes de la tablet). */
export async function listAllApplications(app: AppContext) {
  const rows = await app.db
    .select({ a: s.creditApplications, inst: s.creditInstitutions.name, customer: s.customers.displayName, customerNumber: s.customers.customerNumber })
    .from(s.creditApplications)
    .innerJoin(s.creditInstitutions, eq(s.creditInstitutions.id, s.creditApplications.institutionId))
    .innerJoin(s.customers, eq(s.customers.id, s.creditApplications.customerId))
    .where(eq(s.creditApplications.workspaceId, app.workspaceId))
    .orderBy(desc(s.creditApplications.updatedAt));
  return rows.map(({ a, inst, customer, customerNumber }) => ({ id: a.id, customerId: a.customerId, customer, customerNumber, institution: inst, status: a.status as CreditApplicationStatus, updatedAt: a.updatedAt }));
}

let marioSourceId: string | null = null;
async function marioQuoteSource(app: AppContext) {
  if (marioSourceId) {
    const [ok] = await app.db.select({ id: s.knowledgeSources.id }).from(s.knowledgeSources).where(eq(s.knowledgeSources.id, marioSourceId));
    if (ok) return marioSourceId;
  }
  const name = "Cotización enviada por Mario (cotizador de la agencia)";
  const [existing] = await app.db.select().from(s.knowledgeSources).where(and(eq(s.knowledgeSources.workspaceId, app.workspaceId), eq(s.knowledgeSources.name, name)));
  const id = existing?.id ?? (await app.db.insert(s.knowledgeSources).values({ workspaceId: app.workspaceId, name, sourceType: "mario_manual", notes: "Cifras capturadas por Mario desde su cotizador. Sofía no las calcula." }).returning())[0]!.id;
  marioSourceId = id;
  return id;
}

/**
 * Mario registra la cotización que ÉL mandó (Sofía no calcula nada). Queda ligada al cliente,
 * como escenario recibido, y el objetivo pasa a seguimiento: se agenda un seguimiento si no hay.
 */
export async function registerMarioQuote(
  app: AppContext,
  input: { customerId: string; model: string; version?: string | null; downPayment: number; termMonths?: number | null; monthlyPayment?: number | null; vehiclePrice?: number | null; followupInDays?: number },
) {
  const [customer] = await app.db.select().from(s.customers).where(and(eq(s.customers.id, input.customerId), eq(s.customers.workspaceId, app.workspaceId)));
  if (!customer) throw new ServiceError("Cliente no encontrado.", 404);
  if (!(input.downPayment >= 0)) throw new ServiceError("Enganche inválido.");
  const cat = await loadCatalog(app.db, app.workspaceId);
  const vehicle = findVehicle(cat, input.model);
  if (!vehicle) throw new ServiceError(`No tengo registrado el modelo ${input.model}.`);
  const version = input.version ? findVersion(cat, vehicle.id, input.version) : null;
  const now = app.clock.now();
  const [q] = await app.db
    .insert(s.quotes)
    .values({
      workspaceId: app.workspaceId,
      customerId: input.customerId,
      vehicleId: vehicle.id,
      versionId: version?.id ?? null,
      calculationType: "official",
      status: "presented",
      vehiclePrice: input.vehiclePrice ?? 0,
      downPayment: input.downPayment,
      termMonths: input.termMonths ?? null,
      monthlyPayment: input.monthlyPayment ?? null,
      sourceId: await marioQuoteSource(app),
      calculationTrace: ["Cotización hecha y enviada por Mario (capturada en Sofía)."],
      createdBy: "mario",
      isDemo: customer.isDemo,
    })
    .returning();
  await app.db.update(s.customers).set({ lastContactAt: now, responseStatus: "waiting_customer", updatedAt: now }).where(eq(s.customers.id, input.customerId));
  const pending = await app.db.select().from(s.followups).where(and(eq(s.followups.customerId, input.customerId), eq(s.followups.status, "pending")));
  if (!pending.length) {
    await createFollowup(app, { customerId: input.customerId, dueAt: new Date(now.getTime() + (input.followupInDays ?? 2) * DAY_MS), reason: "Dar seguimiento a la cotización enviada", action: "Llamar" });
  }
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "mario_quote_registered", entityType: "quote", entityId: q!.id, customerId: input.customerId });
  return q!;
}
