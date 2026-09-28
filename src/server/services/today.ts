/**
 * "HOY": solo asuntos que necesitan acción de Mario, priorizados con datos reales.
 * Una línea por asunto: quién/qué, por qué, y la acción concreta.
 */
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { ESCALATION_TRIGGER_LABELS } from "@/domain/enums";
import { normalize } from "@/domain/text";
import { salePendingItems } from "@/domain/sales";
import type { AppContext } from "../app";
import * as s from "../db/schema";
import { DAY_MS } from "../lib/clock";
import { getDocumentChecklist } from "./documents";
import { PLATE_OPEN_STATUSES, PLATE_STATUS_LABELS, type PlateStatus } from "./plates";

export type TodayKind = "alert" | "credit" | "documents" | "conflict" | "followup" | "promise" | "no_response" | "appointment" | "delivery" | "sale" | "plates" | "quote_waiting";

export interface TodayItem {
  key: string;
  kind: TodayKind;
  customerId: string;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
  weight: number;
  when?: Date | null;
  followupId?: string;
  appointmentId?: string;
  phone?: string | null;
  isDemo: boolean;
}

const hhmm = (d: Date) => d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
const daysAgo = (now: Date, d: Date) => Math.max(1, Math.floor((now.getTime() - d.getTime()) / DAY_MS));

export async function getTodayItems(app: AppContext): Promise<TodayItem[]> {
  const now = app.clock.now();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + DAY_MS);
  const ws = app.workspaceId;

  const [customers, profiles, alerts, apps, sales, appts, followups, quotes, plates] = await Promise.all([
    app.db.select().from(s.customers).where(and(eq(s.customers.workspaceId, ws))),
    app.db.select({ customerId: s.customerProfiles.customerId, data: s.customerProfiles.data }).from(s.customerProfiles).where(eq(s.customerProfiles.workspaceId, ws)),
    app.db.select().from(s.marioAlerts).where(and(eq(s.marioAlerts.workspaceId, ws), eq(s.marioAlerts.status, "open"))),
    app.db
      .select({ a: s.creditApplications, inst: s.creditInstitutions.name })
      .from(s.creditApplications)
      .innerJoin(s.creditInstitutions, eq(s.creditInstitutions.id, s.creditApplications.institutionId))
      .where(eq(s.creditApplications.workspaceId, ws)),
    app.db.select().from(s.saleRecords).where(eq(s.saleRecords.workspaceId, ws)),
    app.db.select().from(s.appointments).where(and(eq(s.appointments.workspaceId, ws), gte(s.appointments.scheduledAt, start), lt(s.appointments.scheduledAt, end), inArray(s.appointments.status, ["scheduled", "confirmed"]))),
    app.db.select().from(s.followups).where(and(eq(s.followups.workspaceId, ws), eq(s.followups.status, "pending"), lt(s.followups.dueAt, end))),
    app.db.select().from(s.quotes).where(and(eq(s.quotes.workspaceId, ws), eq(s.quotes.status, "presented"))),
    app.db.select().from(s.plateCases).where(and(eq(s.plateCases.workspaceId, ws), inArray(s.plateCases.status, PLATE_OPEN_STATUSES))),
  ]);
  const cust = new Map(customers.filter((c) => !c.archivedAt).map((c) => [c.id, c]));
  const phoneOf = (id: string) => {
    const d = profiles.find((p) => p.customerId === id)?.data as Record<string, unknown> | undefined;
    return (d?.mobile_phone as string | undefined) ?? cust.get(id)?.phone ?? null;
  };
  const vehicleOf = (id: string) => {
    const d = profiles.find((p) => p.customerId === id)?.data as Record<string, unknown> | undefined;
    return [d?.vehicle_interest, d?.version].filter(Boolean).join(" ") || null;
  };
  const shortName = (id: string) => (cust.get(id)?.displayName ?? "Cliente").replace(/\s*\(DEMO\)\s*/i, "");
  const items: TodayItem[] = [];
  const push = (it: Omit<TodayItem, "isDemo" | "phone"> & { phone?: string | null }) => {
    const c = cust.get(it.customerId);
    if (!c) return;
    items.push({ phone: phoneOf(it.customerId), ...it, isDemo: c.isDemo });
  };

  const approvedCustomers = new Set(apps.filter(({ a }) => a.status === "approved").map(({ a }) => a.customerId));
  for (const a of alerts.filter((x) => !(x.trigger === "credit_approved" && approvedCustomers.has(x.customerId)))) push({ key: `alert:${a.id}`, kind: "alert", customerId: a.customerId, title: shortName(a.customerId), detail: ESCALATION_TRIGGER_LABELS[a.trigger] ?? "Necesita que entres tú", actionLabel: "Entrar tú", href: `/customers/${a.customerId}`, weight: 100 });

  for (const { a, inst } of apps) {
    if (a.status === "approved") {
      const sale = sales.find((sl) => sl.creditApplicationId === a.id || sl.customerId === a.customerId);
      if (!sale || ["prospect", "negotiation", "credit_process", "approved"].includes(sale.status)) {
        push({ key: `credit:${a.id}`, kind: "credit", customerId: a.customerId, title: shortName(a.customerId), detail: `Crédito ${inst} aprobado`, actionLabel: "Continuar venta", href: sale ? `/sales/${sale.id}` : `/customers/${a.customerId}`, weight: 80 });
      }
    }
    if (a.status === "conflict") push({ key: `conflict:${a.id}`, kind: "conflict", customerId: a.customerId, title: shortName(a.customerId), detail: `Solicitud ${inst}: datos que no coinciden`, actionLabel: "Resolver", href: `/customers/${a.customerId}/credit/${a.id}?step=completar`, weight: 50 });
  }

  const activeApps = new Set(apps.filter(({ a }) => ["draft", "missing_information", "conflict", "ready_for_review", "ready_for_signature", "submitted"].includes(a.status)).map(({ a }) => a.customerId));
  for (const customerId of activeApps) {
    const missing = (await getDocumentChecklist(app, customerId)).filter((d) => d.requiredBy.length > 0 && ["missing", "requested", "rejected"].includes(d.status));
    if (missing.length) {
      push({ key: `docs:${customerId}`, kind: "documents", customerId, title: shortName(customerId), detail: missing.length === 1 ? `Falta ${missing[0]!.label.toLowerCase()}` : `Faltan ${missing.length} documentos: ${missing.slice(0, 2).map((d) => d.label.toLowerCase()).join(", ")}…`, actionLabel: "Solicitar documento", href: `/customers/${customerId}?tab=documentos`, weight: 45 });
    }
  }

  for (const ap of appts) {
    push({ key: `appt:${ap.id}`, kind: "appointment", customerId: ap.customerId, title: shortName(ap.customerId), detail: `Cita hoy ${ap.scheduledAt ? hhmm(ap.scheduledAt) : ""}${ap.location ? ` · ${ap.location}` : ""}`, actionLabel: "Ver cita", href: `/agenda#${ap.id}`, weight: 70, when: ap.scheduledAt, appointmentId: ap.id });
  }

  for (const sl of sales) {
    if (sl.deliveryDate && ["invoiced", "delivery_pending"].includes(sl.status)) {
      const d = sl.deliveryDate;
      const days = Math.floor((d.getTime() - start.getTime()) / DAY_MS);
      if (days <= 2) {
        const when = days < 0 ? "Entrega vencida" : days === 0 ? `Entrega hoy ${hhmm(d)}` : days === 1 ? `Entrega mañana ${hhmm(d)}` : `Entrega en ${days} días`;
        push({ key: `delivery:${sl.id}`, kind: "delivery", customerId: sl.customerId, title: `${(sl.unitDescription ?? "Unidad").split(" ").slice(0, 2).join(" ")} de ${shortName(sl.customerId).split(" ")[0]}`, detail: when, actionLabel: "Ver operación", href: `/sales/${sl.id}`, weight: days <= 0 ? 75 : 40, when: d });
      }
    }
    const pend = salePendingItems(sl, now).filter((p) => p === "Venta sin pedido" || p === "Venta sin factura");
    if (pend.length && ["approved", "order_created"].includes(sl.status)) {
      push({ key: `sale:${sl.id}`, kind: "sale", customerId: sl.customerId, title: shortName(sl.customerId), detail: pend[0]!, actionLabel: "Capturar", href: `/sales/${sl.id}`, weight: 30 });
    }
  }

  const withFollowup = new Set<string>();
  for (const f of followups) {
    withFollowup.add(f.customerId);
    const overdue = f.dueAt !== null && f.dueAt < start;
    push({
      key: `fu:${f.id}`,
      kind: f.promisedByMario ? "promise" : "followup",
      customerId: f.customerId,
      title: shortName(f.customerId),
      detail: `${f.promisedByMario ? "Le prometiste: " : ""}${f.reason}${overdue ? ` · vencido hace ${daysAgo(now, f.dueAt!)} día(s)` : ""}`,
      actionLabel: f.action ?? "Seguimiento",
      href: `/customers/${f.customerId}`,
      weight: f.promisedByMario ? 60 : overdue ? 55 : 35,
      when: f.dueAt,
      followupId: f.id,
    });
  }

  // Sin respuesta: el cliente no contesta desde hace ≥ 2 días (y no hay seguimiento agendado).
  for (const c of cust.values()) {
    if (c.responseStatus === "waiting_customer" && c.lastContactAt && now.getTime() - c.lastContactAt.getTime() >= 2 * DAY_MS && !withFollowup.has(c.id)) {
      push({ key: `noresp:${c.id}`, kind: "no_response", customerId: c.id, title: shortName(c.id), detail: `Sin respuesta desde hace ${daysAgo(now, c.lastContactAt)} días`, actionLabel: "Seguimiento", href: `/customers/${c.id}`, weight: 42 });
      withFollowup.add(c.id);
    }
  }
  for (const q of quotes) {
    const hours = (now.getTime() - q.createdAt.getTime()) / 3_600_000;
    if (hours >= 48 && !withFollowup.has(q.customerId) && !sales.some((sl) => sl.quoteId === q.id || sl.customerId === q.customerId)) {
      withFollowup.add(q.customerId);
      push({ key: `quote:${q.id}`, kind: "quote_waiting", customerId: q.customerId, title: shortName(q.customerId), detail: `Sin respuesta desde hace ${Math.floor(hours / 24)} días · ${vehicleOf(q.customerId) ?? "cotización"}`, actionLabel: "Seguimiento", href: `/customers/${q.customerId}`, weight: 38 });
    }
  }

  for (const pc of plates) {
    const missing = pc.requirements.filter((r) => !r.received);
    const due = pc.dueDate && pc.dueDate < end;
    if (pc.status === "problem" || due || pc.status === "ready") {
      push({
        key: `plates:${pc.id}`,
        kind: "plates",
        customerId: pc.customerId,
        title: shortName(pc.customerId),
        detail: `Placas: ${pc.status === "ready" ? "listo para enviar" : missing.length ? `falta ${missing[0]!.label.toLowerCase()}` : PLATE_STATUS_LABELS[pc.status as PlateStatus]}`,
        actionLabel: pc.status === "ready" ? "Preparar correo" : "Ver placas",
        href: `/plates/${pc.id}`,
        weight: pc.status === "problem" ? 50 : 32,
      });
    }
  }

  // Una línea por cliente (la más importante); citas y entregas del día se muestran aparte.
  const seen = new Set<string>();
  const TIMED = new Set<TodayKind>(["appointment", "delivery"]);
  return items
    .sort((a, b) => b.weight - a.weight || (a.when?.getTime() ?? 0) - (b.when?.getTime() ?? 0))
    .filter((it) => {
      const k = TIMED.has(it.kind) ? `${it.customerId}:${it.kind}` : `${it.customerId}:main`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

// ───────── búsqueda global ─────────

export interface SearchHit {
  kind: "customer" | "sale" | "plate";
  id: string;
  title: string;
  detail: string;
  href: string;
}

export async function searchEverything(app: AppContext, q: string, limit = 8): Promise<SearchHit[]> {
  const term = normalize(q).trim();
  if (term.length < 2) return [];
  const digits = q.replace(/\D/g, "");
  const ws = app.workspaceId;
  const [customers, profiles, sales, plates] = await Promise.all([
    app.db.select().from(s.customers).where(eq(s.customers.workspaceId, ws)),
    app.db.select({ customerId: s.customerProfiles.customerId, data: s.customerProfiles.data }).from(s.customerProfiles).where(eq(s.customerProfiles.workspaceId, ws)),
    app.db.select().from(s.saleRecords).where(eq(s.saleRecords.workspaceId, ws)),
    app.db.select().from(s.plateCases).where(eq(s.plateCases.workspaceId, ws)),
  ]);
  const hits: Array<SearchHit & { score: number }> = [];
  const has = (v: unknown) => typeof v === "string" && v && normalize(v).includes(term);
  const words = term.split(/\s+/).filter((w) => w.length > 1);
  for (const c of customers) {
    if (c.archivedAt) continue;
    const d = (profiles.find((p) => p.customerId === c.id)?.data ?? {}) as Record<string, unknown>;
    const phone = String(d.mobile_phone ?? c.phone ?? "");
    const vehicle = [d.vehicle_interest, d.version].filter(Boolean).join(" ");
    const name = normalize(c.displayName);
    let score = 0;
    if (name.startsWith(term)) score = 10;
    else if (name.includes(term)) score = 8;
    else if (words.length && words.every((w) => name.includes(w))) score = 7;
    else if (digits.length >= 4 && phone.includes(digits)) score = 9;
    else if (has(vehicle)) score = 4;
    if (score) hits.push({ kind: "customer", id: c.id, title: c.displayName, detail: [vehicle, phone ? `···${phone.slice(-4)}` : ""].filter(Boolean).join(" · "), href: `/customers/${c.id}`, score });
  }
  for (const sl of sales) {
    const fields: Array<[string, string | null]> = [
      ["Cliente #", sl.customerNumber],
      ["Pedido", sl.orderNumber],
      ["Factura", sl.invoiceNumber],
      ["VIN", sl.vin],
      ["Unidad", sl.unitDescription],
    ];
    const match = fields.find(([, v]) => has(v));
    if (match) hits.push({ kind: "sale", id: sl.id, title: `Venta · ${sl.customerName}`, detail: `${match[0]} ${match[1]}`, href: `/sales/${sl.id}`, score: match[0] === "Unidad" ? 3 : 9 });
  }
  for (const pc of plates) if (has(pc.vin)) hits.push({ kind: "plate", id: pc.id, title: "Placas", detail: `VIN ${pc.vin}`, href: `/plates/${pc.id}`, score: 8 });
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((h) => ({ kind: h.kind, id: h.id, title: h.title, detail: h.detail, href: h.href }));
}
