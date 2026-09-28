import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAppContext } from "@/server/app";
import { executeConfirmed } from "@/server/command/router";
import { logger } from "@/server/lib/logger";
import { ServiceError } from "@/server/services/errors";

export const dynamic = "force-dynamic";

/** Ejecuta una acción que Mario confirmó explícitamente (se re-valida en el servidor). */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action?: unknown };
    const res = await executeConfirmed(await getAppContext(), body.action);
    revalidatePath("/", "layout");
    return Response.json(res);
  } catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError) return Response.json({ error: "Acción inválida." }, { status: 400 });
    logger.error("command.confirm.error", { error: e instanceof Error ? e.message : "error" });
    return Response.json({ error: "No se pudo completar." }, { status: 500 });
  }
}
