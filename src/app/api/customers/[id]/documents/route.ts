import { revalidatePath } from "next/cache";
import { getAppContext } from "@/server/app";
import { logger } from "@/server/lib/logger";
import { ServiceError } from "@/server/services/errors";
import { MAX_UPLOAD_BYTES, uploadDocument } from "@/server/services/inbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Subir documentos del cliente (PDF/JPG/PNG). Almacenamiento privado; nunca /public. */
export async function POST(req: Request, ctx: RouteContext<"/api/customers/[id]/documents">) {
  const { id } = await ctx.params;
  try {
    const form = await req.formData();
    const docType = String(form.get("docType") ?? "other");
    const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return Response.json({ error: "Selecciona un archivo." }, { status: 400 });
    const app = await getAppContext();
    const results = [];
    for (const f of files.slice(0, 10)) {
      if (f.size > MAX_UPLOAD_BYTES) {
        results.push({ ok: false, error: "Pesa más de 15 MB." });
        continue;
      }
      try {
        const doc = await uploadDocument(app, { customerId: id, bytes: new Uint8Array(await f.arrayBuffer()), fileName: f.name, docType });
        results.push({ ok: true, id: doc.id, status: doc.extractionStatus });
      } catch (e) {
        results.push({ ok: false, error: e instanceof ServiceError ? e.message : "No se pudo guardar." });
        if (!(e instanceof ServiceError)) logger.error("inbox.upload_error", { error: e instanceof Error ? e.message : "error" });
      }
    }
    revalidatePath(`/customers/${id}`, "layout");
    return Response.json({ results });
  } catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: e.message }, { status: e.status });
    logger.error("inbox.upload_error", { error: e instanceof Error ? e.message : "error" });
    return Response.json({ error: "No se pudo subir." }, { status: 500 });
  }
}
