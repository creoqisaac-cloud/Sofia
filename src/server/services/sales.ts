/**
 * Control de ventas. Continuidad del proceso: una venta hereda cliente, vehículo,
 * enganche, bono, comisión y seguro de la cotización elegida (Mario puede ajustar),
 * y cada cambio queda en `sale_record_changes`. No hay cálculo de comisiones.
 */
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { SALE_STATUS_LABELS, type SaleStatus } from "@/domain/enums";
import { formatFactValue } from "@/domain/facts";
import { SALE_FIELDS, salePendingItems, validateSaleStatusChange, type SaleFieldKey } from "@/domain/sales";
import type { AppContext } from "../app";
import { writeCrmState } from "../agent/effects";
import { loadCatalog } from "../commercial/catalog";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { ServiceError } from "./errors";

type SaleRow = typeof s.saleRecords.$inferSelect;

export const SALE_FILTERS = {
  all: { label: "Todas", statuses: null },
  in_process: { label: "En proceso", statuses: ["prospect", "negotiation", "approved", "order_created"] },
  credit: { label: "Crédito", statuses: ["credit_process"] },
  invoiced: { label: "Facturadas", statuses: ["invoiced"] },
  to_deliver: { label: "Por entregar", statuses: ["invoiced", "delivery_pending"] },
  delivered: { label: "Entregadas", statuses: ["delivered"] },
  cancelled: { label: "Canceladas", statuses: ["cancelled"] },
} as const satisfies Record<string, { label: string; statuses: readonly SaleStatus[] | null }>;
export type SaleFilter = keyof typeof SALE_FILTERS;

async function customerDisplayName(db: Db, customerId: string) {
  const [c] = await db.select().from(s.customers).where(eq(s.customers.id, customerId));
  const [p] = await db.select().from(s.customerProfiles).where(eq(s.customerProfiles.customerId, customerId));
  const d = (p?.data ?? {}) as Record<string, unknown>;
  const full = [d.first_name, d.middle_name, d.paternal_last_name, d.maternal_last_name].filter((x) => typeof x === "string" && x).join(" ");
  return { customer: c, name: full || c?.displayName || "Cliente" };
}

export async function createSale(app: AppContext, input: { customerId: string; quoteId?: string | null; creditApplicationId?: string | null }) {
  const { customer, name } = await customerDisplayName(app.db, input.customerId);
  if (!customer || customer.workspaceId !== app.workspaceId) throw new ServiceError("Cliente no encontrado.", 404);
  let quote: typeof s.quotes.$inferSelect | undefined;
  if (input.quoteId) {
    [quote] = await app.db.select().from(s.quotes).where(and(eq(s.quotes.id, input.quoteId), eq(s.quotes.customerId, input.customerId)));
    if (!quote) throw new ServiceError("La cotización no pertenece a este cliente.", 409);
  }
  let credit: typeof s.creditApplications.$inferSelect | undefined;
  if (input.creditApplicationId) {
    [credit] = await app.db.select().from(s.creditApplications).where(and(eq(s.creditApplications.id, input.creditApplicationId), eq(s.creditApplications.customerId, input.customerId)));
    if (!credit) throw new ServiceError("La solicitud no pertenece a este cliente.", 409);
  }
  const catalog = await loadCatalog(app.db, app.workspaceId);
  const vehicle = quote?.vehicleId ? catalog.vehicles.find((v) => v.id === quote!.vehicleId) : undefined;
  const version = quote?.versionId ? catalog.versions.find((v) => v.id === quote!.versionId) : undefined;
  const status: SaleStatus = credit?.status === "approved" ? "approved" : credit ? "credit_process" : "negotiation";

  return app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [sale] = await tx
      .insert(s.saleRecords)
      .values({
        workspaceId: app.workspaceId,
        customerId: input.customerId,
        quoteId: quote?.id ?? null,
        creditApplicationId: credit?.id ?? null,
        vehicleId: quote?.vehicleId ?? null,
        versionId: quote?.versionId ?? null,
        customerName: name,
        unitDescription: vehicle ? `${vehicle.model} ${version?.name ?? ""} ${vehicle.modelYear}`.replace(/\s+/g, " ").trim() : null,
        // Heredado de la cotización elegida; Mario lo revisa y ajusta. El valor factura NO se asume.
        bonus: quote?.bonus ?? null,
        downPayment: quote?.downPayment ?? null,
        openingCommission: quote?.openingCommission ?? null,
        insuranceAmount: quote?.insurance ?? null,
        status,
        source: quote ? "quote" : "manual",
        createdBy: "mario",
        isDemo: Boolean(quote?.isDemo),
      })
      .returning();
    await tx.insert(s.saleRecordChanges).values({
      workspaceId: app.workspaceId,
      saleId: sale!.id,
      field: "created",
      newValue: { status, quoteId: quote?.id ?? null, creditApplicationId: credit?.id ?? null, inherited: quote ? ["unitDescription", "bonus", "downPayment", "openingCommission", "insuranceAmount"] : [] },
      reason: quote ? "Creada desde cotización seleccionada." : "Creada manualmente.",
      actorType: "mario",
      actorId: app.advisorUserId,
    });
    await tx.insert(s.auditEvents).values({
      workspaceId: app.workspaceId,
      customerId: input.customerId,
      actorType: "mario",
      actorId: app.advisorUserId,
      eventType: "sale_created",
      entityType: "sale_record",
      entityId: sale!.id,
      data: { status, fromQuote: Boolean(quote), withCredit: Boolean(credit) },
    });
    return sale!;
  });
}

function parseFieldValue(key: SaleFieldKey, raw: unknown): unknown {
  const def = SALE_FIELDS.find((f) => f.key === key)!;
  if (raw === null || raw === undefined || raw === "") return null;
  switch (def.type) {
    case "money": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[$,\s]/g, ""));
      if (!Number.isFinite(n) || n < 0) throw new ServiceError(`${def.label}: monto inválido.`);
      return Math.round(n * 100) / 100;
    }
    case "int": {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 20) throw new ServiceError(`${def.label}: número inválido.`);
      return n;
    }
    case "date": {
      const d = raw instanceof Date ? raw : new Date(`${String(raw)}T12:00:00Z`);
      if (Number.isNaN(d.getTime())) throw new ServiceError(`${def.label}: fecha inválida.`);
      return d;
    }
    default:
      return String(raw).trim().slice(0, 2000);
  }
}

function comparable(v: unknown) {
  return v instanceof Date ? v.toISOString().slice(0, 10) : v;
}

/** Actualiza campos y/o estado. Cada cambio real genera historial; nada se sobrescribe en silencio. */
export async function updateSale(app: AppContext, saleId: string, patch: Partial<Record<SaleFieldKey, unknown>> & { status?: SaleStatus }, reason: string | null = null) {
  const [sale] = await app.db.select().from(s.saleRecords).where(and(eq(s.saleRecords.id, saleId), eq(s.saleRecords.workspaceId, app.workspaceId)));
  if (!sale) throw new ServiceError("Venta no encontrada.", 404);
  const updates: Partial<SaleRow> = {};
  const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
  for (const def of SALE_FIELDS) {
    if (!(def.key in patch)) continue;
    const next = parseFieldValue(def.key, patch[def.key]);
    const prev = sale[def.key];
    if (JSON.stringify(comparable(prev)) === JSON.stringify(comparable(next))) continue;
    (updates as Record<string, unknown>)[def.key] = next;
    changes.push({ field: def.key, oldValue: comparable(prev) ?? null, newValue: comparable(next) ?? null });
  }
  if (patch.status && patch.status !== sale.status) {
    const check = validateSaleStatusChange(sale.status, patch.status, reason);
    if (!check.ok) throw new ServiceError(check.reason, 409);
    updates.status = patch.status;
    changes.push({ field: "status", oldValue: sale.status, newValue: patch.status });
  }
  if (!changes.length) return { sale, changes: [] };

  return app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const [updated] = await tx.update(s.saleRecords).set({ ...updates, updatedAt: new Date() }).where(eq(s.saleRecords.id, saleId)).returning();
    for (const c of changes) {
      await tx.insert(s.saleRecordChanges).values({ workspaceId: app.workspaceId, saleId, field: c.field, oldValue: c.oldValue, newValue: c.newValue, reason, actorType: "mario", actorId: app.advisorUserId });
    }
    await tx.insert(s.auditEvents).values({
      workspaceId: app.workspaceId,
      customerId: sale.customerId,
      actorType: "mario",
      actorId: app.advisorUserId,
      eventType: "sale_updated",
      entityType: "sale_record",
      entityId: saleId,
      data: { fields: changes.map((c) => c.field) },
    });
    // Continuidad con el CRM: una venta facturada/entregada marca al cliente como vendido (acción de Mario).
    if (updates.status === "invoiced" || updates.status === "delivered") {
      const [crm] = await tx.select().from(s.crmStates).where(and(eq(s.crmStates.customerId, sale.customerId), eq(s.crmStates.isCurrent, true)));
      if (crm && crm.stage !== "sold") {
        await writeCrmState(tx, {
          workspaceId: app.workspaceId,
          customerId: sale.customerId,
          from: { stage: crm.stage, temperature: crm.temperature },
          to: { stage: "sold", temperature: crm.temperature },
          reason: `Venta ${SALE_STATUS_LABELS[updates.status].toLowerCase()}.`,
          changedBy: "mario",
        });
      }
    }
    return { sale: updated!, changes };
  });
}

export async function listSales(app: AppContext, filter: SaleFilter = "all", opts: { customerId?: string } = {}) {
  const f = SALE_FILTERS[filter] ?? SALE_FILTERS.all;
  const conds: SQL[] = [eq(s.saleRecords.workspaceId, app.workspaceId)];
  if (f.statuses) conds.push(inArray(s.saleRecords.status, [...f.statuses]));
  if (opts.customerId) conds.push(eq(s.saleRecords.customerId, opts.customerId));
  const rows = await app.db.select().from(s.saleRecords).where(and(...conds)).orderBy(desc(s.saleRecords.updatedAt));
  const now = app.clock.now();
  return rows.map((r) => ({ ...r, pending: salePendingItems(r, now) }));
}

export async function getSaleDetail(app: AppContext, saleId: string) {
  const [sale] = await app.db.select().from(s.saleRecords).where(and(eq(s.saleRecords.id, saleId), eq(s.saleRecords.workspaceId, app.workspaceId)));
  if (!sale) throw new ServiceError("Venta no encontrada.", 404);
  const [changes, quote, credit, customer, profile, appointments] = await Promise.all([
    app.db.select().from(s.saleRecordChanges).where(eq(s.saleRecordChanges.saleId, saleId)).orderBy(desc(s.saleRecordChanges.seq)),
    sale.quoteId ? app.db.select().from(s.quotes).where(eq(s.quotes.id, sale.quoteId)).then((r) => r[0] ?? null) : Promise.resolve(null),
    sale.creditApplicationId
      ? app.db
          .select({ application: s.creditApplications, institution: s.creditInstitutions })
          .from(s.creditApplications)
          .innerJoin(s.creditInstitutions, eq(s.creditInstitutions.id, s.creditApplications.institutionId))
          .where(eq(s.creditApplications.id, sale.creditApplicationId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    app.db.select().from(s.customers).where(eq(s.customers.id, sale.customerId)).then((r) => r[0]!),
    app.db.select().from(s.customerProfiles).where(eq(s.customerProfiles.customerId, sale.customerId)).then((r) => (r[0]?.data ?? {}) as Record<string, unknown>),
    app.db.select().from(s.appointments).where(eq(s.appointments.customerId, sale.customerId)).orderBy(desc(s.appointments.createdAt)).limit(5),
  ]);
  const phone = typeof profile.mobile_phone === "string" ? formatFactValue("mobile_phone", profile.mobile_phone) : customer.phone;
  return { sale, pending: salePendingItems(sale, app.clock.now()), changes, quote, credit, customer: { id: customer.id, displayName: customer.displayName, phone }, appointments };
}

/** Datos preparados para reportes futuros (ventas por mes, facturado, adicionales…). Sin comisiones. */
export async function salesSummaryByMonth(app: AppContext) {
  const rows = await app.db.select().from(s.saleRecords).where(eq(s.saleRecords.workspaceId, app.workspaceId));
  const map = new Map<string, { month: string; delivered: number; invoicedValue: number; extras: number; warranties: number; insurance: number }>();
  for (const r of rows) {
    const date = r.invoiceDate ?? r.deliveryDate;
    if (!date || r.status === "cancelled") continue;
    const month = date.toISOString().slice(0, 7);
    const m = map.get(month) ?? { month, delivered: 0, invoicedValue: 0, extras: 0, warranties: 0, insurance: 0 };
    if (r.status === "delivered") m.delivered++;
    m.invoicedValue += r.invoiceValue ?? 0;
    m.extras += r.extrasAmount ?? 0;
    m.warranties += r.warrantyAmount ?? 0;
    m.insurance += r.insuranceAmount ?? 0;
    map.set(month, m);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}
