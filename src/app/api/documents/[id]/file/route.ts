import { getAppContext } from "@/server/app";
import { ServiceError } from "@/server/services/errors";
import { readDocumentFile } from "@/server/services/inbox";

export const dynamic = "force-dynamic";

/** Archivo privado de un documento del cliente (vista previa / compartir). Nunca se cachea. */
export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]/file">) {
  const { id } = await ctx.params;
  try {
    const { bytes, mime, doc } = await readDocumentFile(await getAppContext(), id);
    const ext = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="documento-${doc.id.slice(0, 8)}.${ext}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof ServiceError) return new Response(e.message, { status: e.status });
    return new Response("Error", { status: 500 });
  }
}
