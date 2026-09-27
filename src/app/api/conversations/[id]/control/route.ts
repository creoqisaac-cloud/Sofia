import { z } from "zod";
import { CONTROL_MODES } from "@/domain/enums";
import { getAppContext } from "@/server/app";
import { handle, parseBody } from "@/server/http";
import { setControlMode } from "@/server/services/conversation";

const Schema = z.object({ mode: z.enum(CONTROL_MODES) });

export const POST = handle(async (request: Request, ctx: RouteContext<"/api/conversations/[id]/control">) => {
  const { id } = await ctx.params;
  const app = await getAppContext();
  const { mode } = await parseBody(request, Schema);
  const conv = await setControlMode(app, id, mode);
  return { controlMode: conv.controlMode };
});
