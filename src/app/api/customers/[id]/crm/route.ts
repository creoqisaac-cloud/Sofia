import { z } from "zod";
import { CRM_STAGES, TEMPERATURES } from "@/domain/enums";
import { getAppContext } from "@/server/app";
import { handle, parseBody } from "@/server/http";
import { setCrmManually } from "@/server/services/customers";

const Schema = z.object({ stage: z.enum(CRM_STAGES), temperature: z.enum(TEMPERATURES), reason: z.string().min(1).max(500) });

export const POST = handle(async (request: Request, ctx: RouteContext<"/api/customers/[id]/crm">) => {
  const { id } = await ctx.params;
  const app = await getAppContext();
  await setCrmManually(app, id, await parseBody(request, Schema));
  return { ok: true };
});
