import { z } from "zod";
import { getAppContext } from "@/server/app";
import { runCommand } from "@/server/command/router";
import { logger } from "@/server/lib/logger";
import { ServiceError } from "@/server/services/errors";

export const dynamic = "force-dynamic";

const Body = z.object({ text: z.string().min(1).max(500), context: z.object({ lastCustomerId: z.string().uuid().nullable().optional() }).optional() });

/** Comando universal (texto o voz transcrita). Nunca modifica datos: lo que cambia algo regresa como acción por confirmar. */
export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const res = await runCommand(await getAppContext(), body.text, body.context ?? {});
    return Response.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return Response.json({ error: "Comando inválido." }, { status: 400 });
    // El texto del comando puede traer datos personales: no se registra.
    logger.error("command.error", { error: e instanceof Error ? e.message : "error" });
    return Response.json({ error: "No pude procesar el comando." }, { status: 500 });
  }
}
