import { z } from "zod";
import { getAppContext } from "@/server/app";
import { handle, parseBody } from "@/server/http";
import { decideApproval } from "@/server/services/mario";

const Schema = z.object({ decision: z.enum(["approved", "rejected"]), notes: z.string().max(500).nullish() });

export const POST = handle(async (request: Request, ctx: RouteContext<"/api/approvals/[id]">) => {
  const { id } = await ctx.params;
  const app = await getAppContext();
  const { decision, notes } = await parseBody(request, Schema);
  const row = await decideApproval(app, id, decision, notes ?? null);
  return { id: row.id, status: row.status };
});
