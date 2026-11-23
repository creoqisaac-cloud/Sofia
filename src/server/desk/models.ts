/**
 * Información de modelos y unidades que Mario le da a Sofía:
 *  - novedades/argumentos por modelo (Sofía los menciona una vez por cliente),
 *  - unidades en piso o en tránsito (color, versión, estatus),
 *  - fotos, videos, flyers y fichas (ver media.ts).
 */
import { and, asc, desc, eq } from "drizzle-orm";
import type { AppContext } from "../app";
import { loadCatalog } from "../commercial/catalog";
import { pickListPrice } from "../commercial/quoting";
import * as s from "../db/schema";
import { ServiceError } from "../services/errors";
import { listMedia } from "./media";

export const UPDATE_KINDS: Record<string, string> = { novedad: "Novedad", promo: "Promoción", inventario: "Inventario", ficha: "Dato técnico", argumento: "Argumento de venta" };
export const UNIT_STATUSES: Record<string, string> = { available: "Disponible", in_transit: "En tránsito", reserved: "Apartada", sold: "Vendida" };

export async function getModelsOverview(app: AppContext) {
  const now = app.clock.now();
  const [catalog, updates, units, media] = await Promise.all([
    loadCatalog(app.db, app.workspaceId),
    app.db.select().from(s.vehicleUpdates).where(eq(s.vehicleUpdates.workspaceId, app.workspaceId)).orderBy(desc(s.vehicleUpdates.createdAt)),
    app.db.select().from(s.vehicleUnits).where(eq(s.vehicleUnits.workspaceId, app.workspaceId)).orderBy(asc(s.vehicleUnits.status), desc(s.vehicleUnits.createdAt)),
    listMedia(app, { includeInactive: true }),
  ]);
  const vehicles = catalog.vehicles
    .slice()
    .sort((a, b) => a.model.localeCompare(b.model))
    .map((v) => {
      const versions = catalog.versions
        .filter((x) => x.vehicleId === v.id)
        .map((x) => {
          const price = pickListPrice(catalog, x.id, now);
          return { id: x.id, name: x.name, powertrain: x.powertrain, price: price?.amount ?? null, priceIsDemo: price?.isDemo ?? false };
        })
        .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      return {
        id: v.id,
        model: v.model,
        year: v.modelYear,
        segment: v.segment,
        isDemo: v.isDemo,
        versions,
        updates: updates.filter((u) => u.vehicleId === v.id).map((u) => ({ id: u.id, kind: u.kind, text: u.text, active: u.active && (!u.validTo || u.validTo >= now), validTo: u.validTo, createdAt: u.createdAt })),
        units: units.filter((u) => u.vehicleId === v.id),
        media: media.filter((m) => m.vehicleId === v.id),
      };
    });
  return {
    vehicles,
    general: {
      updates: updates.filter((u) => !u.vehicleId).map((u) => ({ id: u.id, kind: u.kind, text: u.text, active: u.active && (!u.validTo || u.validTo >= now), validTo: u.validTo, createdAt: u.createdAt })),
      media: media.filter((m) => !m.vehicleId),
    },
  };
}
export type ModelsOverview = Awaited<ReturnType<typeof getModelsOverview>>;

async function assertVehicle(app: AppContext, vehicleId: string | null) {
  if (!vehicleId) return;
  const [v] = await app.db.select({ id: s.vehicles.id }).from(s.vehicles).where(and(eq(s.vehicles.id, vehicleId), eq(s.vehicles.workspaceId, app.workspaceId)));
  if (!v) throw new ServiceError("Modelo no encontrado.", 404);
}

export async function addVehicleUpdate(app: AppContext, input: { vehicleId: string | null; kind: string; text: string; validTo: Date | null }) {
  await assertVehicle(app, input.vehicleId);
  const text = input.text.trim();
  if (!text) throw new ServiceError("Escribe la información para Sofía.");
  const [row] = await app.db
    .insert(s.vehicleUpdates)
    .values({ workspaceId: app.workspaceId, vehicleId: input.vehicleId, kind: UPDATE_KINDS[input.kind] ? input.kind : "novedad", text: text.slice(0, 600), validTo: input.validTo })
    .returning();
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "vehicle_update_added", entityType: "vehicle_update", entityId: row!.id, data: { kind: row!.kind } });
  return row!;
}

export async function setVehicleUpdate(app: AppContext, id: string, patch: { active?: boolean; text?: string; validTo?: Date | null }) {
  const [row] = await app.db
    .update(s.vehicleUpdates)
    .set({
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.text !== undefined ? { text: patch.text.trim().slice(0, 600) } : {}),
      ...(patch.validTo !== undefined ? { validTo: patch.validTo } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(s.vehicleUpdates.id, id), eq(s.vehicleUpdates.workspaceId, app.workspaceId)))
    .returning();
  if (!row) throw new ServiceError("Información no encontrada.", 404);
  return row;
}

export async function deleteVehicleUpdate(app: AppContext, id: string) {
  await app.db.delete(s.vehicleUpdates).where(and(eq(s.vehicleUpdates.id, id), eq(s.vehicleUpdates.workspaceId, app.workspaceId)));
}

export async function addUnit(app: AppContext, input: { vehicleId: string; versionName?: string | null; color?: string | null; modelYear?: number | null; status?: string; price?: number | null; notes?: string | null }) {
  await assertVehicle(app, input.vehicleId);
  const [row] = await app.db
    .insert(s.vehicleUnits)
    .values({
      workspaceId: app.workspaceId,
      vehicleId: input.vehicleId,
      versionName: input.versionName?.trim() || null,
      color: input.color?.trim() || null,
      modelYear: input.modelYear && input.modelYear > 2000 && input.modelYear < 2100 ? input.modelYear : null,
      status: input.status && UNIT_STATUSES[input.status] ? input.status : "available",
      price: input.price && input.price > 0 ? input.price : null,
      notes: input.notes?.trim().slice(0, 300) || null,
    })
    .returning();
  return row!;
}

export async function updateUnit(app: AppContext, id: string, patch: { status?: string; color?: string | null; versionName?: string | null; notes?: string | null; price?: number | null }) {
  const [row] = await app.db
    .update(s.vehicleUnits)
    .set({
      ...(patch.status && UNIT_STATUSES[patch.status] ? { status: patch.status } : {}),
      ...(patch.color !== undefined ? { color: patch.color?.trim() || null } : {}),
      ...(patch.versionName !== undefined ? { versionName: patch.versionName?.trim() || null } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes?.trim().slice(0, 300) || null } : {}),
      ...(patch.price !== undefined ? { price: patch.price && patch.price > 0 ? patch.price : null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(s.vehicleUnits.id, id), eq(s.vehicleUnits.workspaceId, app.workspaceId)))
    .returning();
  if (!row) throw new ServiceError("Unidad no encontrada.", 404);
  return row;
}

export async function deleteUnit(app: AppContext, id: string) {
  await app.db.delete(s.vehicleUnits).where(and(eq(s.vehicleUnits.id, id), eq(s.vehicleUnits.workspaceId, app.workspaceId)));
}

/** Alta rápida de un modelo nuevo (las versiones y precios se capturan en Reglas comerciales). */
export async function addVehicle(app: AppContext, input: { model: string; year: number; segment?: string | null; aliases?: string[] }) {
  const model = input.model.trim().slice(0, 40);
  if (!model) throw new ServiceError("Escribe el nombre del modelo.");
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) throw new ServiceError("Año inválido.");
  const [row] = await app.db
    .insert(s.vehicles)
    .values({ workspaceId: app.workspaceId, model, modelYear: input.year, segment: input.segment?.trim() || null, aliases: (input.aliases ?? []).map((a) => a.trim()).filter(Boolean).slice(0, 8) })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new ServiceError("Ese modelo y año ya existen.", 409);
  return row;
}
