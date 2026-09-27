import { z } from "zod";
import { getAppContext } from "@/server/app";
import { handle, parseBody } from "@/server/http";
import { updateAlertStatus } from "@/server/services/mario";

const Schema = z.object({ status: z.enum(["acknowledged", "resolved", "dismissed"]) });

export const POST = handle(async (request: Request, ctx: RouteContext<"/api/alerts/[id]">) => {
  const { id } = await ctx.params;
  const app = await getAppContext();
  const { status } = await parseBody(request, Schema);
  const alert = await updateAlertStatus(app, id, status);
  return { id: alert.id, status: alert.status };
});
