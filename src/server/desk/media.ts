/**
 * Biblioteca de material por modelo: fotos, videos, flyers y fichas.
 * Mario sube el archivo una vez; Sofía lo adjunta cuando el cliente pregunta por el modelo,
 * cuando recomienda otra opción o cuando Mario lo pide en una indicación.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../app";
import * as s from "../db/schema";
import { ServiceError } from "../services/errors";

export const MEDIA_KINDS = ["photo", "video", "flyer", "sheet"] as const;
export type MediaKindValue = (typeof MEDIA_KINDS)[number];
export const MEDIA_KIND_LABELS: Record<MediaKindValue, string> = { photo: "Foto", video: "Video", flyer: "Flyer", sheet: "Ficha técnica" };

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|gif|heic|heif)|video\/(mp4|quicktime|webm|3gpp)|application\/pdf)$/;

export interface MediaLite {
  id: string;
  vehicleId: string | null;
  model: string | null;
  versionName: string | null;
  kind: MediaKindValue;
  title: string;
  caption: string | null;
  mimeType: string;
  sendOnAsk: boolean;
  validTo: Date | null;
  sortOrder: number;
}

export const mediaUrl = (id: string) => `/api/desk/media/${id}`;

function inferKind(mime: string, requested: string | null): MediaKindValue {
  if (requested && (MEDIA_KINDS as readonly string[]).includes(requested)) return requested as MediaKindValue;
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "sheet";
  return "photo";
}

export async function uploadMedia(
  app: AppContext,
  input: { file: File; vehicleId: string | null; kind: string | null; title: string | null; caption: string | null; versionName: string | null; unitId: string | null; validTo: Date | null; sendOnAsk: boolean },
) {
  const mime = input.file.type || "application/octet-stream";
  if (!ALLOWED_MIME.test(mime)) throw new ServiceError("Formato no permitido. Usa foto (JPG/PNG/WebP/HEIC), video (MP4/MOV) o PDF.");
  if (input.file.size === 0) throw new ServiceError("El archivo está vacío.");
  if (input.file.size > MAX_BYTES) throw new ServiceError("El archivo pesa más de 50 MB. Comprime el video antes de subirlo.");
  if (input.vehicleId) {
    const [v] = await app.db.select({ id: s.vehicles.id }).from(s.vehicles).where(and(eq(s.vehicles.id, input.vehicleId), eq(s.vehicles.workspaceId, app.workspaceId)));
    if (!v) throw new ServiceError("Modelo no encontrado.", 404);
  }
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const ref = await app.storage.put(app.workspaceId, "media", bytes, mime);
  const kind = inferKind(mime, input.kind);
  const title = (input.title?.trim() || input.file.name.replace(/\.[^.]+$/, "") || MEDIA_KIND_LABELS[kind]).slice(0, 120);
  const [row] = await app.db
    .insert(s.vehicleMedia)
    .values({
      workspaceId: app.workspaceId,
      vehicleId: input.vehicleId,
      versionName: input.versionName?.trim() || null,
      unitId: input.unitId,
      kind,
      title,
      caption: input.caption?.trim().slice(0, 1000) || null,
      mimeType: mime,
      sizeBytes: ref.sizeBytes,
      storageProvider: ref.provider,
      storageBucket: ref.bucket,
      storageKey: ref.key,
      sha256: ref.sha256,
      sendOnAsk: input.sendOnAsk,
      validTo: input.validTo,
    })
    .returning();
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "media_uploaded", entityType: "vehicle_media", entityId: row!.id, data: { kind, sizeBytes: ref.sizeBytes } });
  return row!;
}

export async function listMedia(app: AppContext, opts: { vehicleId?: string | null; includeInactive?: boolean } = {}): Promise<MediaLite[]> {
  const rows = await app.db
    .select({ m: s.vehicleMedia, model: s.vehicles.model })
    .from(s.vehicleMedia)
    .leftJoin(s.vehicles, eq(s.vehicles.id, s.vehicleMedia.vehicleId))
    .where(
      and(
        eq(s.vehicleMedia.workspaceId, app.workspaceId),
        opts.includeInactive ? undefined : eq(s.vehicleMedia.active, true),
        opts.vehicleId === undefined ? undefined : opts.vehicleId === null ? undefined : eq(s.vehicleMedia.vehicleId, opts.vehicleId),
      ),
    )
    .orderBy(asc(s.vehicleMedia.sortOrder), desc(s.vehicleMedia.createdAt));
  return rows.map(({ m, model }) => toLite(m, model));
}

export function toLite(m: typeof s.vehicleMedia.$inferSelect, model: string | null): MediaLite {
  return {
    id: m.id,
    vehicleId: m.vehicleId,
    model,
    versionName: m.versionName,
    kind: m.kind as MediaKindValue,
    title: m.title,
    caption: m.caption,
    mimeType: m.mimeType,
    sendOnAsk: m.sendOnAsk,
    validTo: m.validTo,
    sortOrder: m.sortOrder,
  };
}

export async function getMediaByIds(app: AppContext, ids: string[]): Promise<MediaLite[]> {
  if (!ids.length) return [];
  const rows = await app.db
    .select({ m: s.vehicleMedia, model: s.vehicles.model })
    .from(s.vehicleMedia)
    .leftJoin(s.vehicles, eq(s.vehicles.id, s.vehicleMedia.vehicleId))
    .where(and(eq(s.vehicleMedia.workspaceId, app.workspaceId), inArray(s.vehicleMedia.id, ids)));
  const byId = new Map(rows.map(({ m, model }) => [m.id, toLite(m, model)]));
  return ids.map((id) => byId.get(id)).filter((x): x is MediaLite => Boolean(x));
}

export async function readMediaFile(app: AppContext, id: string) {
  const [m] = await app.db.select().from(s.vehicleMedia).where(and(eq(s.vehicleMedia.id, id), eq(s.vehicleMedia.workspaceId, app.workspaceId)));
  if (!m) throw new ServiceError("Archivo no encontrado.", 404);
  const bytes = await app.storage.get({ bucket: m.storageBucket, key: m.storageKey });
  return { bytes, mimeType: m.mimeType, title: m.title, kind: m.kind };
}

export async function updateMedia(
  app: AppContext,
  id: string,
  patch: { title?: string; caption?: string | null; sendOnAsk?: boolean; active?: boolean; sortOrder?: number; vehicleId?: string | null; kind?: MediaKindValue; validTo?: Date | null },
) {
  const [row] = await app.db
    .update(s.vehicleMedia)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 120) || "Sin título" } : {}),
      ...(patch.caption !== undefined ? { caption: patch.caption?.trim().slice(0, 1000) || null } : {}),
      ...(patch.sendOnAsk !== undefined ? { sendOnAsk: patch.sendOnAsk } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.vehicleId !== undefined ? { vehicleId: patch.vehicleId } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.validTo !== undefined ? { validTo: patch.validTo } : {}),
    })
    .where(and(eq(s.vehicleMedia.id, id), eq(s.vehicleMedia.workspaceId, app.workspaceId)))
    .returning();
  if (!row) throw new ServiceError("Archivo no encontrado.", 404);
  return row;
}

export async function deleteMedia(app: AppContext, id: string) {
  const [m] = await app.db.select().from(s.vehicleMedia).where(and(eq(s.vehicleMedia.id, id), eq(s.vehicleMedia.workspaceId, app.workspaceId)));
  if (!m) throw new ServiceError("Archivo no encontrado.", 404);
  await app.db.delete(s.vehicleMedia).where(eq(s.vehicleMedia.id, id));
  await app.storage.remove({ bucket: m.storageBucket, key: m.storageKey }).catch(() => undefined);
  await app.db.insert(s.auditEvents).values({ workspaceId: app.workspaceId, actorType: "mario", eventType: "media_deleted", entityType: "vehicle_media", entityId: id, data: {} });
}

/** Material vigente para un modelo (o general si `vehicleId` es null), del tipo pedido. */
export function pickMedia(
  library: MediaLite[],
  args: { vehicleId: string | null; kinds: MediaKindValue[]; now: Date; onlyOnAsk?: boolean; exclude?: Set<string>; perKind?: Partial<Record<MediaKindValue, number>> },
): MediaLite[] {
  const out: MediaLite[] = [];
  for (const kind of args.kinds) {
    const max = args.perKind?.[kind] ?? (kind === "photo" ? 3 : 1);
    const pool = library
      .filter((m) => m.kind === kind && m.vehicleId === args.vehicleId && (!m.validTo || m.validTo.getTime() >= args.now.getTime()))
      .filter((m) => !args.onlyOnAsk || m.sendOnAsk)
      .filter((m) => !args.exclude?.has(m.id));
    out.push(...pool.slice(0, max));
  }
  return out;
}
