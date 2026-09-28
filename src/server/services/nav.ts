import { and, count, eq } from "drizzle-orm";
import type { AppContext } from "../app";
import * as s from "../db/schema";

/** Contador ligero para la navegación (alertas "MARIO, ENTRA TÚ" abiertas). */
export async function getDashboardCounts(app: AppContext): Promise<number> {
  const [row] = await app.db.select({ n: count() }).from(s.marioAlerts).where(and(eq(s.marioAlerts.workspaceId, app.workspaceId), eq(s.marioAlerts.status, "open")));
  return row?.n ?? 0;
}
