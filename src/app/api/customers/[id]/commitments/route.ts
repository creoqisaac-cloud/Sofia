import { z } from "zod";
import { getAppContext } from "@/server/app";
import { handle, parseBody } from "@/server/http";
import { addManualCommitment } from "@/server/services/conversation";

const Schema = z.object({ text: z.string().min(1).max(240) });

export const POST = handle(async (request: Request, ctx: RouteContext<"/api/customers/[id]/commitments">) => {
  const { id } = await ctx.params;
  const app = await getAppContext();
  const { text } = await parseBody(request, Schema);
  await addManualCommitment(app, id, text);
  return { ok: true };
});
