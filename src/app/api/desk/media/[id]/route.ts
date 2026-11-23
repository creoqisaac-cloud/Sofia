import { z } from "zod";
import { getAppContext } from "@/server/app";
import { deleteMedia, MEDIA_KINDS, readMediaFile, updateMedia } from "@/server/desk/media";
import { handle, parseBody } from "@/server/http";
import { ServiceError } from "@/server/services/errors";

export const dynamic = "force-dynamic";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/3gpp": "3gp", "application/pdf": "pdf" };

/** Archivo de la biblioteca (con soporte de rangos para que los videos se reproduzcan en iPhone). */
export async function GET(request: Request, ctx: RouteContext<"/api/desk/media/[id]">) {
  const { id } = await ctx.params;
  try {
    const { bytes, mimeType, title } = await readMediaFile(await getAppContext(), id);
    const name = `${title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "archivo"}.${EXT[mimeType] ?? "bin"}`;
    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    };
    const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
    if (range && (range[1] || range[2])) {
      const size = bytes.byteLength;
      let start = range[1] ? Number(range[1]) : size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : size - 1;
      start = Math.max(0, start);
      end = Math.min(size - 1, end);
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      return new Response(Buffer.from(bytes.subarray(start, end + 1)), {
        status: 206,
        headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
      });
    }
    return new Response(Buffer.from(bytes), { headers: { ...headers, "Content-Length": String(bytes.byteLength) } });
  } catch (e) {
    if (e instanceof ServiceError) return new Response(e.message, { status: e.status });
    return new Response("Error", { status: 500 });
  }
}

const Patch = z.object({
  title: z.string().max(120).optional(),
  caption: z.string().max(1000).nullable().optional(),
  sendOnAsk: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  kind: z.enum(MEDIA_KINDS).optional(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const PATCH = handle(async (request: Request, ctx: RouteContext<"/api/desk/media/[id]">) => {
  const { id } = await ctx.params;
  const { validTo, ...rest } = await parseBody(request, Patch);
  const row = await updateMedia(await getAppContext(), id, { ...rest, ...(validTo !== undefined ? { validTo: validTo ? new Date(`${validTo}T23:59:59-06:00`) : null } : {}) });
  return { ok: true, id: row.id };
});

export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/desk/media/[id]">) => {
  const { id } = await ctx.params;
  await deleteMedia(await getAppContext(), id);
  return { ok: true };
});
