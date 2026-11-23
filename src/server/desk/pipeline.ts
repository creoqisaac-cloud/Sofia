/**
 * Tablero de clientes de Mario: columnas a su gusto (Caliente / Tibio / Frío / Apartados…),
 * vista por columna o por mes, y etiquetas libres. Las etiquetas de modelo ("modelo:HR-V")
 * las mantiene Sofía sola a partir del modelo de interés.
 *
 * - Sofía coloca a cada cliente nuevo según su temperatura y lo va moviendo mientras Mario no
 *   lo haya acomodado a mano.
 * - Cuando Mario lo mueve, la tarjeta queda fija ("pinned") y, si la columna representa una
 *   temperatura, la temperatura del CRM se actualiza (registrada como cambio de Mario).
 */
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { TEMPERATURES, type Temperature } from "@/domain/enums";
import { periodOf } from "@/domain/sales-style";
import { isModelTag, modelTag, TAG_CATALOG, tagLabel } from "@/domain/tags";
import { normalize } from "@/domain/text";
import type { AppContext } from "../app";
import { writeCrmState } from "../agent/effects";
import type { Db } from "../db/client";
import * as s from "../db/schema";
import { ServiceError } from "../services/errors";

export const COLUMN_COLORS = ["red", "orange", "amber", "green", "blue", "violet", "gray"] as const;
export type ColumnColor = (typeof COLUMN_COLORS)[number];

const DEFAULT_COLUMNS: Array<{ name: string; color: ColumnColor; temperature: Temperature | null }> = [
  { name: "Caliente", color: "red", temperature: "hot" },
  { name: "Tibio", color: "amber", temperature: "interested" },
  { name: "Frío", color: "blue", temperature: "cold" },
];

export async function ensureColumns(app: AppContext) {
  const cols = await app.db
    .select()
    .from(s.pipelineColumns)
    .where(and(eq(s.pipelineColumns.workspaceId, app.workspaceId), isNull(s.pipelineColumns.archivedAt)))
    .orderBy(asc(s.pipelineColumns.sortOrder), asc(s.pipelineColumns.createdAt));
  if (cols.length) return cols;
  await app.db.insert(s.pipelineColumns).values(DEFAULT_COLUMNS.map((c, i) => ({ workspaceId: app.workspaceId, ...c, sortOrder: i })));
  return app.db
    .select()
    .from(s.pipelineColumns)
    .where(and(eq(s.pipelineColumns.workspaceId, app.workspaceId), isNull(s.pipelineColumns.archivedAt)))
    .orderBy(asc(s.pipelineColumns.sortOrder));
}

type ColumnRow = typeof s.pipelineColumns.$inferSelect;

export function columnForTemperature(cols: ColumnRow[], temp: Temperature): ColumnRow | null {
  const exact = cols.find((c) => c.temperature === temp);
  if (exact) return exact;
  if (temp === "very_hot") return cols.find((c) => c.temperature === "hot") ?? null;
  if (temp === "hot") return cols.find((c) => c.temperature === "very_hot") ?? null;
  return null;
}

/** Etiqueta de modelo + lugar en el tablero de un cliente (después de cada turno de Sofía). */
export async function syncCustomerBoard(app: AppContext, customerId: string) {
  const cols = await ensureColumns(app);
  const [[profile], [crm], [card], tags] = await Promise.all([
    app.db.select({ data: s.customerProfiles.data }).from(s.customerProfiles).where(eq(s.customerProfiles.customerId, customerId)),
    app.db.select({ temperature: s.crmStates.temperature }).from(s.crmStates).where(and(eq(s.crmStates.customerId, customerId), eq(s.crmStates.isCurrent, true))),
    app.db.select().from(s.pipelineCards).where(eq(s.pipelineCards.customerId, customerId)),
    app.db.select({ tag: s.customerTags.tag }).from(s.customerTags).where(and(eq(s.customerTags.customerId, customerId), isNull(s.customerTags.removedAt))),
  ]);
  const interest = profile?.data?.vehicle_interest;
  if (typeof interest === "string" && interest.trim()) {
    const tag = modelTag(interest.trim());
    if (!tags.some((t) => t.tag === tag)) {
      await app.db.insert(s.customerTags).values({ workspaceId: app.workspaceId, customerId, tag, source: "sofia", reason: "Modelo de interés" }).onConflictDoNothing();
    }
  }
  const temp = (crm?.temperature ?? "cold") as Temperature;
  const target = columnForTemperature(cols, temp);
  if (!card) {
    await app.db
      .insert(s.pipelineCards)
      .values({ workspaceId: app.workspaceId, customerId, columnId: (target ?? cols[0])?.id ?? null, period: periodOf(app.clock.now()), position: -app.clock.now().getTime() / 1000 })
      .onConflictDoNothing();
  } else if (!card.pinned && target && card.columnId !== target.id) {
    await app.db.update(s.pipelineCards).set({ columnId: target.id, updatedAt: new Date() }).where(eq(s.pipelineCards.id, card.id));
  }
}

export interface BoardCard {
  customerId: string;
  name: string;
  phone: string | null;
  temperature: Temperature;
  stage: string;
  columnId: string | null;
  period: string;
  position: number;
  pinned: boolean;
  tags: Array<{ tag: string; label: string; model: boolean }>;
  lastAt: string | null;
  responseStatus: string;
  nextAppointment: { at: string; kind: string } | null;
  pendingOutbox: number;
}

export async function getBoard(app: AppContext) {
  const cols = await ensureColumns(app);
  const now = app.clock.now();
  const customers = await app.db
    .select({
      id: s.customers.id,
      name: s.customers.displayName,
      phone: s.customers.phone,
      createdAt: s.customers.createdAt,
      responseStatus: s.customers.responseStatus,
      temperature: s.crmStates.temperature,
      stage: s.crmStates.stage,
      lastMessageAt: sql<Date | null>`(select max(${s.conversations.lastMessageAt}) from ${s.conversations} where ${s.conversations.customerId} = ${s.customers.id})`,
    })
    .from(s.customers)
    .leftJoin(s.crmStates, and(eq(s.crmStates.customerId, s.customers.id), eq(s.crmStates.isCurrent, true)))
    .where(and(eq(s.customers.workspaceId, app.workspaceId), isNull(s.customers.archivedAt)));
  const ids = customers.map((c) => c.id);
  const [cards, tags, appts, outbox] = ids.length
    ? await Promise.all([
        app.db.select().from(s.pipelineCards).where(eq(s.pipelineCards.workspaceId, app.workspaceId)),
        app.db.select({ customerId: s.customerTags.customerId, tag: s.customerTags.tag }).from(s.customerTags).where(and(eq(s.customerTags.workspaceId, app.workspaceId), isNull(s.customerTags.removedAt))),
        app.db
          .select({ customerId: s.appointments.customerId, at: s.appointments.scheduledAt, kind: s.appointments.kind })
          .from(s.appointments)
          .where(and(eq(s.appointments.workspaceId, app.workspaceId), inArray(s.appointments.status, ["scheduled", "confirmed"]), gte(s.appointments.scheduledAt, new Date(now.getTime() - 3 * 3600_000))))
          .orderBy(asc(s.appointments.scheduledAt)),
        app.db
          .select({ customerId: s.outboxMessages.customerId, n: sql<number>`count(*)::int` })
          .from(s.outboxMessages)
          .where(and(eq(s.outboxMessages.workspaceId, app.workspaceId), eq(s.outboxMessages.status, "pending")))
          .groupBy(s.outboxMessages.customerId),
      ])
    : [[], [], [], []];

  // Clientes sin tarjeta: se colocan según su temperatura (en el mes en que llegaron).
  const cardByCustomer = new Map(cards.map((c) => [c.customerId, c]));
  const missing = customers.filter((c) => !cardByCustomer.has(c.id));
  if (missing.length) {
    const rows = missing.map((c) => ({
      workspaceId: app.workspaceId,
      customerId: c.id,
      columnId: (columnForTemperature(cols, (c.temperature ?? "cold") as Temperature) ?? cols[0])?.id ?? null,
      period: periodOf(c.lastMessageAt ? new Date(c.lastMessageAt) : c.createdAt),
      position: -(c.lastMessageAt ? new Date(c.lastMessageAt) : c.createdAt).getTime() / 1000,
    }));
    const inserted = await app.db.insert(s.pipelineCards).values(rows).onConflictDoNothing().returning();
    for (const r of inserted) cardByCustomer.set(r.customerId, r);
  }

  const tagMap = new Map<string, string[]>();
  for (const t of tags) tagMap.set(t.customerId, [...(tagMap.get(t.customerId) ?? []), t.tag]);
  const apptMap = new Map<string, { at: string; kind: string }>();
  for (const a of appts) if (a.at && !apptMap.has(a.customerId)) apptMap.set(a.customerId, { at: a.at.toISOString(), kind: a.kind });
  const outboxMap = new Map(outbox.map((o) => [o.customerId, Number(o.n)]));
  const colIds = new Set(cols.map((c) => c.id));

  const out: BoardCard[] = customers.map((c) => {
    const card = cardByCustomer.get(c.id);
    const t = tagMap.get(c.id) ?? [];
    return {
      customerId: c.id,
      name: c.name.replace(/\s*\(DEMO\)\s*/g, " ").trim(),
      phone: c.phone,
      temperature: (c.temperature ?? "cold") as Temperature,
      stage: c.stage ?? "new",
      columnId: card?.columnId && colIds.has(card.columnId) ? card.columnId : (cols[0]?.id ?? null),
      period: card?.period ?? periodOf(c.createdAt),
      position: card?.position ?? 0,
      pinned: card?.pinned ?? false,
      tags: t.map((tag) => ({ tag, label: tagLabel(tag), model: isModelTag(tag) })).sort((a, b) => Number(b.model) - Number(a.model)),
      lastAt: c.lastMessageAt ? new Date(c.lastMessageAt).toISOString() : null,
      responseStatus: c.responseStatus,
      nextAppointment: apptMap.get(c.id) ?? null,
      pendingOutbox: outboxMap.get(c.id) ?? 0,
    };
  });
  out.sort((a, b) => a.position - b.position);

  const current = periodOf(now);
  const periods = Array.from(new Set([...out.map((c) => c.period), current, shiftPeriod(current, 1), shiftPeriod(current, 2)])).sort().reverse();
  const models = Array.from(new Set(out.flatMap((c) => c.tags.filter((t) => t.model).map((t) => t.label)))).sort();
  return {
    columns: cols.map((c) => ({ id: c.id, name: c.name, color: c.color, temperature: c.temperature })),
    cards: out,
    periods,
    currentPeriod: current,
    models,
  };
}
export type Board = Awaited<ReturnType<typeof getBoard>>;

export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function assertCustomer(app: AppContext, customerId: string) {
  const [c] = await app.db.select({ id: s.customers.id }).from(s.customers).where(and(eq(s.customers.id, customerId), eq(s.customers.workspaceId, app.workspaceId)));
  if (!c) throw new ServiceError("Cliente no encontrado.", 404);
}

/** Mario mueve una tarjeta (columna, mes y/o lugar). */
export async function moveCard(app: AppContext, customerId: string, input: { columnId?: string | null; period?: string; position?: number }) {
  await assertCustomer(app, customerId);
  const cols = await ensureColumns(app);
  const column = input.columnId ? cols.find((c) => c.id === input.columnId) : undefined;
  if (input.columnId && !column) throw new ServiceError("Columna no encontrada.", 404);
  if (input.period !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) throw new ServiceError("Mes inválido.");
  await syncCustomerBoard(app, customerId);
  await app.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    await tx
      .update(s.pipelineCards)
      .set({
        ...(column ? { columnId: column.id } : {}),
        ...(input.period ? { period: input.period } : {}),
        ...(typeof input.position === "number" && Number.isFinite(input.position) ? { position: input.position } : {}),
        pinned: true,
        updatedAt: new Date(),
      })
      .where(eq(s.pipelineCards.customerId, customerId));
    if (column?.temperature) {
      const [cur] = await tx.select().from(s.crmStates).where(and(eq(s.crmStates.customerId, customerId), eq(s.crmStates.isCurrent, true)));
      if (!cur || cur.temperature !== column.temperature) {
        await writeCrmState(tx, {
          workspaceId: app.workspaceId,
          customerId,
          from: cur ? { stage: cur.stage, temperature: cur.temperature } : null,
          to: { stage: cur?.stage ?? "profiling", temperature: column.temperature },
          reason: `Mario lo acomodó en “${column.name}” del tablero.`,
          changedBy: "mario",
        });
      }
    }
    await tx.insert(s.auditEvents).values({ workspaceId: app.workspaceId, customerId, actorType: "mario", eventType: "board_card_moved", entityType: "pipeline_card", data: { columnId: column?.id ?? null, period: input.period ?? null } });
  });
}

export async function addColumn(app: AppContext, input: { name: string; color?: string; temperature?: Temperature | null }) {
  const name = input.name.trim().slice(0, 40);
  if (!name) throw new ServiceError("Escribe el nombre de la columna.");
  const cols = await ensureColumns(app);
  const [row] = await app.db
    .insert(s.pipelineColumns)
    .values({
      workspaceId: app.workspaceId,
      name,
      color: (COLUMN_COLORS as readonly string[]).includes(input.color ?? "") ? input.color! : "gray",
      temperature: input.temperature && (TEMPERATURES as readonly string[]).includes(input.temperature) ? input.temperature : null,
      sortOrder: (cols.at(-1)?.sortOrder ?? 0) + 1,
    })
    .returning();
  return row!;
}

export async function updateColumn(app: AppContext, id: string, input: { name?: string; color?: string; temperature?: Temperature | null }) {
  const [row] = await app.db
    .update(s.pipelineColumns)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim().slice(0, 40) || "Columna" } : {}),
      ...(input.color !== undefined && (COLUMN_COLORS as readonly string[]).includes(input.color) ? { color: input.color } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature && (TEMPERATURES as readonly string[]).includes(input.temperature) ? input.temperature : null } : {}),
    })
    .where(and(eq(s.pipelineColumns.id, id), eq(s.pipelineColumns.workspaceId, app.workspaceId)))
    .returning();
  if (!row) throw new ServiceError("Columna no encontrada.", 404);
  return row;
}

/** Quita una columna; sus clientes pasan a la primera columna que quede. */
export async function removeColumn(app: AppContext, id: string) {
  const cols = await ensureColumns(app);
  if (cols.length <= 1) throw new ServiceError("Deja al menos una columna en el tablero.");
  const rest = cols.filter((c) => c.id !== id);
  if (rest.length === cols.length) throw new ServiceError("Columna no encontrada.", 404);
  await app.db.update(s.pipelineCards).set({ columnId: rest[0]!.id }).where(and(eq(s.pipelineCards.workspaceId, app.workspaceId), eq(s.pipelineCards.columnId, id)));
  await app.db.update(s.pipelineColumns).set({ archivedAt: new Date() }).where(eq(s.pipelineColumns.id, id));
}

export async function reorderColumns(app: AppContext, ids: string[]) {
  const cols = await ensureColumns(app);
  const valid = ids.filter((id) => cols.some((c) => c.id === id));
  await Promise.all(valid.map((id, i) => app.db.update(s.pipelineColumns).set({ sortOrder: i }).where(eq(s.pipelineColumns.id, id))));
}

/** Etiqueta libre de Mario (si coincide con una del catálogo, se usa esa). */
export async function addTag(app: AppContext, customerId: string, text: string) {
  await assertCustomer(app, customerId);
  const clean = text.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!clean) throw new ServiceError("Escribe la etiqueta.");
  const known = Object.entries(TAG_CATALOG).find(([k, label]) => normalize(label) === normalize(clean) || k === normalize(clean).replace(/ /g, "_"));
  const tag = known ? known[0] : clean;
  await app.db.insert(s.customerTags).values({ workspaceId: app.workspaceId, customerId, tag, source: "mario", reason: "Etiqueta de Mario" }).onConflictDoNothing();
  return tag;
}

export async function removeTag(app: AppContext, customerId: string, tag: string) {
  await assertCustomer(app, customerId);
  if (isModelTag(tag)) throw new ServiceError("La etiqueta del modelo la mantiene Sofía; cambia el modelo de interés en la ficha del cliente.");
  await app.db
    .update(s.customerTags)
    .set({ removedAt: new Date() })
    .where(and(eq(s.customerTags.customerId, customerId), eq(s.customerTags.tag, tag), isNull(s.customerTags.removedAt)));
}

/** Clientes por columna/mes (para indicaciones). */
export async function cardsFor(app: AppContext) {
  return app.db.select().from(s.pipelineCards).where(eq(s.pipelineCards.workspaceId, app.workspaceId)).orderBy(desc(s.pipelineCards.updatedAt));
}
