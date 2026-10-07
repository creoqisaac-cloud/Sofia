import { getAppContext } from "@/server/app";
import { handle } from "@/server/http";
import { setReminderStatus } from "@/server/services/reminders";

export const dynamic = "force-dynamic";

/** Quitar un recordatorio libre. */
export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/reminders/[id]">) => {
  const { id } = await ctx.params;
  await setReminderStatus(await getAppContext(), id, "cancelled");
  return { ok: true };
});
