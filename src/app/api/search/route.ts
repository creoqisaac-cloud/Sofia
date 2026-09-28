import { getAppContext } from "@/server/app";
import { searchEverything } from "@/server/services/today";

export const dynamic = "force-dynamic";

/** Búsqueda global: nombre, teléfono, # cliente, pedido, factura, VIN, vehículo. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const hits = await searchEverything(await getAppContext(), q.slice(0, 80));
  return Response.json({ hits }, { headers: { "Cache-Control": "no-store" } });
}
