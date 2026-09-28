import { getAppContext } from "@/server/app";
import { getGeneratedPdf } from "@/server/services/credit";
import { ServiceError } from "@/server/services/errors";

export const dynamic = "force-dynamic";

/** Descarga de un borrador generado (almacenamiento privado; nunca cacheado). */
export async function GET(_req: Request, ctx: RouteContext<"/api/documents/generated/[id]">) {
  const { id } = await ctx.params;
  try {
    const { bytes } = await getGeneratedPdf(await getAppContext(), id);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="borrador-${id.slice(0, 8)}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof ServiceError) return new Response(e.message, { status: e.status });
    return new Response("Error", { status: 500 });
  }
}
