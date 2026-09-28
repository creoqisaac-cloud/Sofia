/**
 * "¿Qué necesita mi atención hoy?" — todo se deriva de la BD en cada consulta.
 * Las alertas operativas son vistas calculadas (no se duplican en tablas); las
 * "🔥 MARIO, ENTRA TÚ" siguen viviendo en `mario_alerts`.
 */
import { and, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { CREDIT_APPLICATION_STATUS_LABELS, CRM_STAGE_LABELS, SALE_STATUS_LABELS, TEMPERATURE_LABELS, type CrmStage, type Temperature } from "@/domain/enums";
import { salePendingItems } from "@/domain/sales";
import type { AppContext } from "../app";
import { loadCatalog } from "../commercial/catalog";
import * as s from "../db/schema";
import { getDocumentChecklist } from "./documents";

export type OperationalAlertType =
  | "missing_documents"
  | "application_conflict"
  | "application_ready_for_review"
  | "credit_approved"
  | "sale_without_order"
  | "sale_without_invoice"
  | "unit_pending_delivery"
  | "delivery_soon"
  | "missing_commercial_data";

export interface OperationalAlert {
  type: OperationalAlertType;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  customerId: string;
  customerName: string;
  href: string;
}

export interface CustomerListItem {
  id: string;
  displayName: string;
  vehicle: string | null;
  stage: CrmStage;
  temperature: Temperature;
  lastContactAt: Date | null;
  nextStep: string | null;
  pendingCount: number;
  openAlerts: number;
  isDemo: boolean;
}

export const CUSTOMER_FILTERS = {
  all: { label: "Todos" },
  hot: { label: "Calientes" },
  credit: { label: "Crédito" },
  documentation: { label: "Documentación" },
  appointment: { label: "Cita" },
  follow_up: { label: "Seguimiento" },
  sold: { label: "Vendidos" },
} as const;
export type CustomerFilter = keyof typeof CUSTOMER_FILTERS;

export async function listCustomersForApp(app: AppContext, filter: CustomerFilter = "all", query = ""): Promise<CustomerListItem[]> {
  const rows = await app.db
    .select({
      id: s.customers.id,
      displayName: s.customers.displayName,
      isDemo: s.customers.isDemo,
      createdAt: s.customers.createdAt,
      lastMessageAt: s.conversations.lastMessageAt,
      stage: s.crmStates.stage,
      temperature: s.crmStates.temperature,
      profile: s.customerProfiles.data,
    })
    .from(s.customers)
    .leftJoin(s.conversations, eq(s.conversations.customerId, s.customers.id))
    .leftJoin(s.crmStates, and(eq(s.crmStates.customerId, s.customers.id), eq(s.crmStates.isCurrent, true)))
    .leftJoin(s.customerProfiles, eq(s.customerProfiles.customerId, s.customers.id))
    .where(and(eq(s.customers.workspaceId, app.workspaceId), isNull(s.customers.archivedAt)));
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [alerts, summaries, apps, followups] = await Promise.all([
    app.db.select({ customerId: s.marioAlerts.customerId }).from(s.marioAlerts).where(and(inArray(s.marioAlerts.customerId, ids), eq(s.marioAlerts.status, "open"))),
    app.db.select().from(s.customerSummaries).where(inArray(s.customerSummaries.customerId, ids)).orderBy(desc(s.customerSummaries.version)),
    app.db.select({ customerId: s.creditApplications.customerId, status: s.creditApplications.status }).from(s.creditApplications).where(inArray(s.creditApplications.customerId, ids)),
    app.db.select({ customerId: s.followups.customerId }).from(s.followups).where(and(inArray(s.followups.customerId, ids), eq(s.followups.status, "pending"))),
  ]);
  const q = query.trim().toLowerCase();
  const items = rows
    .map((r) => {
      const p = (r.profile ?? {}) as Record<string, unknown>;
      const summary = summaries.find((x) => x.customerId === r.id);
      return {
        id: r.id,
        displayName: r.displayName,
        vehicle: [p.vehicle_interest, p.version].filter((x) => typeof x === "string").join(" ") || null,
        stage: (r.stage ?? "new") as CrmStage,
        temperature: (r.temperature ?? "cold") as Temperature,
        lastContactAt: r.lastMessageAt ?? null,
        nextStep: summary?.nextAction?.description ?? null,
        pendingCount: (summary?.pendingItems.length ?? 0) + followups.filter((f) => f.customerId === r.id).length,
        openAlerts: alerts.filter((a) => a.customerId === r.id).length,
        isDemo: r.isDemo,
        _apps: apps.filter((a) => a.customerId === r.id).map((a) => a.status),
        _sort: (r.lastMessageAt ?? r.createdAt).getTime(),
      };
    })
    .filter((c) => !q || c.displayName.toLowerCase().includes(q) || (c.vehicle ?? "").toLowerCase().includes(q))
    .filter((c) => {
      switch (filter) {
        case "hot":
          return c.temperature === "hot" || c.temperature === "very_hot";
        case "credit":
          return ["financing", "application", "credit"].includes(c.stage) || c._apps.some((st) => !["cancelled", "rejected"].includes(st));
        case "documentation":
          return c.stage === "documentation";
        case "appointment":
          return c.stage === "appointment" || c.stage === "test_drive";
        case "follow_up":
          return c.stage === "follow_up" || c.pendingCount > 0;
        case "sold":
          return c.stage === "sold";
        default:
          return true;
      }
    })
    .sort((a, b) => b.openAlerts - a.openAlerts || b._sort - a._sort);
  return items.map(({ _apps, _sort, ...rest }) => {
    void _apps;
    void _sort;
    return rest;
  });
}

export async function getOperationalAlerts(app: AppContext): Promise<OperationalAlert[]> {
  const now = app.clock.now();
  const out: OperationalAlert[] = [];
  const customers = await app.db.select({ id: s.customers.id, name: s.customers.displayName }).from(s.customers).where(eq(s.customers.workspaceId, app.workspaceId));
  const name = (id: string) => customers.find((c) => c.id === id)?.name ?? "Cliente";

  const apps = await app.db
    .select({ application: s.creditApplications, institution: s.creditInstitutions })
    .from(s.creditApplications)
    .innerJoin(s.creditInstitutions, eq(s.creditInstitutions.id, s.creditApplications.institutionId))
    .where(eq(s.creditApplications.workspaceId, app.workspaceId));
  const sales = await app.db.select().from(s.saleRecords).where(eq(s.saleRecords.workspaceId, app.workspaceId));

  for (const { application: a, institution } of apps) {
    const href = `/customers/${a.customerId}/credit/${a.id}`;
    if (a.status === "conflict") out.push({ type: "application_conflict", severity: "high", title: `Solicitud ${institution.name} con conflicto`, detail: "Hay datos contradictorios por resolver.", customerId: a.customerId, customerName: name(a.customerId), href });
    if (a.status === "ready_for_review") out.push({ type: "application_ready_for_review", severity: "medium", title: `Solicitud ${institution.name} lista para revisión`, detail: CREDIT_APPLICATION_STATUS_LABELS[a.status], customerId: a.customerId, customerName: name(a.customerId), href });
    if (a.status === "approved" && !sales.some((sl) => sl.creditApplicationId === a.id && ["invoiced", "delivery_pending", "delivered"].includes(sl.status))) {
      out.push({ type: "credit_approved", severity: "high", title: `Crédito ${institution.name} aprobado`, detail: "Listo para avanzar a pedido/cierre.", customerId: a.customerId, customerName: name(a.customerId), href });
    }
  }
  // Documentos: solo para clientes con solicitud activa.
  const activeAppCustomers = Array.from(new Set(apps.filter(({ application: a }) => !["cancelled", "rejected", "approved"].includes(a.status)).map(({ application: a }) => a.customerId)));
  for (const customerId of activeAppCustomers) {
    const checklist = await getDocumentChecklist(app, customerId);
    const missing = checklist.filter((d) => d.requiredBy.length > 0 && (d.status === "missing" || d.status === "requested" || d.status === "rejected"));
    const review = checklist.filter((d) => d.status === "needs_review" || d.status === "received");
    if (missing.length) out.push({ type: "missing_documents", severity: "medium", title: "Faltan documentos", detail: missing.map((d) => d.label).join(", "), customerId, customerName: name(customerId), href: `/customers/${customerId}?tab=documentos` });
    if (review.length) out.push({ type: "missing_documents", severity: "low", title: "Documentos por revisar", detail: review.map((d) => d.label).join(", "), customerId, customerName: name(customerId), href: `/customers/${customerId}?tab=documentos` });
  }
  for (const sale of sales) {
    const href = `/sales/${sale.id}`;
    const pending = salePendingItems(sale, now);
    if (pending.includes("Venta sin pedido")) out.push({ type: "sale_without_order", severity: "medium", title: "Venta sin pedido", detail: sale.unitDescription ?? "", customerId: sale.customerId, customerName: sale.customerName, href });
    if (pending.includes("Venta sin factura")) out.push({ type: "sale_without_invoice", severity: "medium", title: "Venta sin factura", detail: sale.unitDescription ?? "", customerId: sale.customerId, customerName: sale.customerName, href });
    if (sale.status === "invoiced" || sale.status === "delivery_pending") out.push({ type: "unit_pending_delivery", severity: "medium", title: "Unidad pendiente de entrega", detail: sale.unitDescription ?? "", customerId: sale.customerId, customerName: sale.customerName, href });
    const soon = pending.find((p) => p.startsWith("Entrega"));
    if (soon) out.push({ type: "delivery_soon", severity: soon === "Entrega vencida" ? "high" : "medium", title: soon, detail: sale.unitDescription ?? "", customerId: sale.customerId, customerName: sale.customerName, href });
    const missingData = pending.filter((p) => p.startsWith("Falta"));
    if (missingData.length) out.push({ type: "missing_commercial_data", severity: "low", title: "Dato comercial faltante", detail: missingData.join(", "), customerId: sale.customerId, customerName: sale.customerName, href });
  }
  const order = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export interface Priority {
  customerId: string;
  customerName: string;
  vehicle: string | null;
  lines: string[];
  href: string;
  weight: number;
}

export async function getDashboard(app: AppContext) {
  const now = app.clock.now();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

  const [customers, marioAlerts, apps, sales, todayAppointments, overdueFollowups, docs, quotes, catalog] = await Promise.all([
    listCustomersForApp(app),
    app.db
      .select({ alert: s.marioAlerts, customerName: s.customers.displayName })
      .from(s.marioAlerts)
      .innerJoin(s.customers, eq(s.customers.id, s.marioAlerts.customerId))
      .where(and(eq(s.marioAlerts.workspaceId, app.workspaceId), eq(s.marioAlerts.status, "open")))
      .orderBy(desc(s.marioAlerts.createdAt)),
    app.db
      .select({ application: s.creditApplications, institution: s.creditInstitutions })
      .from(s.creditApplications)
      .innerJoin(s.creditInstitutions, eq(s.creditInstitutions.id, s.creditApplications.institutionId))
      .where(eq(s.creditApplications.workspaceId, app.workspaceId)),
    app.db.select().from(s.saleRecords).where(eq(s.saleRecords.workspaceId, app.workspaceId)),
    app.db
      .select()
      .from(s.appointments)
      .where(and(eq(s.appointments.workspaceId, app.workspaceId), gte(s.appointments.scheduledAt, startOfDay), lt(s.appointments.scheduledAt, endOfDay))),
    app.db
      .select()
      .from(s.followups)
      .where(and(eq(s.followups.workspaceId, app.workspaceId), eq(s.followups.status, "pending"), lt(s.followups.dueAt, now))),
    app.db.select().from(s.documents).where(and(eq(s.documents.workspaceId, app.workspaceId), inArray(s.documents.status, ["missing", "requested", "needs_review", "received"]))),
    app.db.select().from(s.quotes).where(and(eq(s.quotes.workspaceId, app.workspaceId), eq(s.quotes.status, "presented"))),
    loadCatalog(app.db, app.workspaceId),
  ]);

  const openApps = apps.filter(({ application: a }) => ["draft", "missing_information", "conflict", "ready_for_review", "ready_for_signature", "submitted"].includes(a.status));
  const approved = apps.filter(({ application: a }) => a.status === "approved" && !sales.some((sl) => sl.creditApplicationId === a.id && ["invoiced", "delivery_pending", "delivered"].includes(sl.status)));
  const toInvoice = sales.filter((sl) => ["approved", "order_created"].includes(sl.status));
  const toDeliver = sales.filter((sl) => ["invoiced", "delivery_pending"].includes(sl.status));
  const hot = customers.filter((c) => c.temperature === "hot" || c.temperature === "very_hot");

  // Prioridades de hoy: una tarjeta por cliente, con sus motivos.
  const priorities = new Map<string, Priority>();
  const add = (customerId: string, line: string, weight: number, href?: string) => {
    const c = customers.find((x) => x.id === customerId);
    if (!c) return;
    const p = priorities.get(customerId) ?? { customerId, customerName: c.displayName, vehicle: c.vehicle, lines: [], href: href ?? `/customers/${customerId}`, weight: 0 };
    if (!p.lines.includes(line)) p.lines.push(line);
    p.weight += weight;
    priorities.set(customerId, p);
  };
  for (const { alert } of marioAlerts) add(alert.customerId, "🔥 Mario, entra tú", 100);
  for (const { application: a, institution } of approved) add(a.customerId, `Crédito ${institution.name} aprobado`, 60, `/customers/${a.customerId}/credit/${a.id}`);
  for (const { application: a, institution } of openApps.filter(({ application: a }) => a.status === "conflict")) add(a.customerId, `Solicitud ${institution.name} con conflicto`, 40, `/customers/${a.customerId}/credit/${a.id}`);
  for (const sl of toDeliver) add(sl.customerId, `Por entregar: ${sl.unitDescription ?? "unidad"}`, 35, `/sales/${sl.id}`);
  for (const sl of toInvoice) add(sl.customerId, `${SALE_STATUS_LABELS[sl.status]} — falta facturar`, 30, `/sales/${sl.id}`);
  for (const d of docs.filter((x) => x.status !== "received" && x.status !== "needs_review")) add(d.customerId, "Falta documentación", 20);
  for (const a of todayAppointments) add(a.customerId, `Cita hoy ${a.scheduledAt ? a.scheduledAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : ""}`.trim(), 45);
  for (const q of quotes) {
    const hours = (now.getTime() - q.createdAt.getTime()) / 3_600_000;
    if (hours >= 48 && !sales.some((sl) => sl.quoteId === q.id)) {
      const vehicle = catalog.vehicles.find((v) => v.id === q.vehicleId)?.model ?? "";
      add(q.customerId, `Cotización ${vehicle} enviada hace ${Math.floor(hours)}h`, 15);
    }
  }
  for (const c of hot) add(c.id, `${TEMPERATURE_LABELS[c.temperature]} · ${CRM_STAGE_LABELS[c.stage]}`, c.temperature === "very_hot" ? 25 : 10);

  return {
    counts: {
      hot: hot.length,
      appointmentsToday: todayAppointments.length,
      pendingApplications: openApps.length,
      approvedCredits: approved.length,
      pendingDocuments: new Set(docs.map((d) => d.customerId)).size,
      toInvoice: toInvoice.length,
      toDeliver: toDeliver.length,
      overdueFollowups: overdueFollowups.length,
      marioAlerts: marioAlerts.length,
    },
    priorities: [...priorities.values()].sort((a, b) => b.weight - a.weight).slice(0, 12),
    marioAlerts: marioAlerts.map(({ alert, customerName }) => ({ ...alert, customerName })),
  };
}
