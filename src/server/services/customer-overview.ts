/**
 * Vista consolidada del cliente para la app: perfil, CRM, cotizaciones, crédito,
 * documentos, ventas, citas e historial. La información se captura una vez y aquí
 * se reutiliza en todas las secciones.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { CrmStage, Temperature } from "@/domain/enums";
import type { AppContext } from "../app";
import { loadCatalog } from "../commercial/catalog";
import * as s from "../db/schema";
import { listCustomerApplications, listInstitutions } from "./credit";
import { getDocumentChecklist } from "./documents";
import { ServiceError } from "./errors";
import { getProfileState } from "./profile";
import { listCustomerQuotes } from "./quotes";
import { listSales } from "./sales";

/** Eventos de auditoría que se muestran en el historial (sin datos sensibles). */
const HISTORY_EVENTS = [
  "customer_created",
  "profile_facts_recorded",
  "fact_conflict_resolved",
  "fact_confirmed",
  "credit_application_created",
  "credit_application_status",
  "credit_pdf_generated",
  "document_status",
  "sale_created",
  "sale_updated",
  "crm_manual_change",
];

export async function getCustomerOverview(app: AppContext, customerId: string) {
  const [customer] = await app.db.select().from(s.customers).where(and(eq(s.customers.id, customerId), eq(s.customers.workspaceId, app.workspaceId)));
  if (!customer) throw new ServiceError("Cliente no encontrado.", 404);
  const [conversation] = await app.db.select().from(s.conversations).where(eq(s.conversations.customerId, customerId)).limit(1);
  const [profile, crmHistory, summary, quotes, applications, documents, sales, appointments, followups, alerts, messages, audit, catalog, institutions] = await Promise.all([
    getProfileState(app.db, customerId),
    app.db.select().from(s.crmStates).where(eq(s.crmStates.customerId, customerId)).orderBy(desc(s.crmStates.seq)),
    app.db.select().from(s.customerSummaries).where(eq(s.customerSummaries.customerId, customerId)).orderBy(desc(s.customerSummaries.version)).limit(1),
    listCustomerQuotes(app, customerId),
    listCustomerApplications(app, customerId),
    getDocumentChecklist(app, customerId),
    listSales(app, "all", { customerId }),
    app.db.select().from(s.appointments).where(eq(s.appointments.customerId, customerId)).orderBy(desc(s.appointments.createdAt)),
    app.db.select().from(s.followups).where(eq(s.followups.customerId, customerId)).orderBy(desc(s.followups.createdAt)),
    app.db.select().from(s.marioAlerts).where(and(eq(s.marioAlerts.customerId, customerId), inArray(s.marioAlerts.status, ["open", "acknowledged"]))),
    conversation ? app.db.select().from(s.messages).where(eq(s.messages.conversationId, conversation.id)).orderBy(desc(s.messages.seq)).limit(60) : Promise.resolve([]),
    app.db.select().from(s.auditEvents).where(and(eq(s.auditEvents.customerId, customerId), inArray(s.auditEvents.eventType, HISTORY_EVENTS))).orderBy(desc(s.auditEvents.createdAt)).limit(60),
    loadCatalog(app.db, app.workspaceId),
    listInstitutions(app),
  ]);
  const current = crmHistory.find((c) => c.isCurrent) ?? crmHistory[0];
  const f = profile.fields;
  const val = (k: string) => (f[k]?.state.status === "confirmed" || f[k]?.state.status === "observed" ? (f[k]!.state.display ?? null) : null);
  const fullName = [val("first_name"), val("middle_name"), val("paternal_last_name"), val("maternal_last_name")].filter(Boolean).join(" ");
  const conflicts = Object.values(f).filter((x) => x.state.status === "conflicting");
  const observed = Object.values(f).filter((x) => x.state.status === "observed");
  const sectionCompleteness = profile.sections
    .filter((sec) => sec.section !== "conditional")
    .map((sec) => ({
      ...sec,
      confirmed: sec.keys.filter((k) => f[k]?.state.status === "confirmed").length,
      total: sec.keys.length,
      conflicts: sec.keys.filter((k) => f[k]?.state.status === "conflicting").length,
    }));
  return {
    customer,
    conversation: conversation ?? null,
    fullName: fullName || customer.displayName,
    vehicle: [val("vehicle_interest"), val("version")].filter(Boolean).join(" ") || null,
    phone: val("mobile_phone") ?? customer.phone,
    crm: { stage: (current?.stage ?? "new") as CrmStage, temperature: (current?.temperature ?? "cold") as Temperature, reason: current?.reason ?? "", history: crmHistory },
    summary: summary[0] ?? null,
    profile,
    conflicts,
    observed,
    sectionCompleteness,
    quotes,
    applications,
    documents,
    sales,
    appointments,
    followups,
    alerts,
    messages: messages.reverse(),
    audit,
    institutions: institutions.map((i) => ({ code: i.code, name: i.name })),
    vehicles: catalog.vehicles.map((v) => ({ model: v.model, versions: catalog.versions.filter((x) => x.vehicleId === v.id).map((x) => x.name) })),
  };
}

export type CustomerOverview = Awaited<ReturnType<typeof getCustomerOverview>>;
