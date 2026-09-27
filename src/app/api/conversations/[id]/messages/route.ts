import { z } from "zod";
import { getAppContext } from "@/server/app";
import { handle, parseBody } from "@/server/http";
import { postCustomerMessage, postMarioMessage } from "@/server/services/conversation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Schema = z.object({ sender: z.enum(["customer", "mario"]), body: z.string().min(1).max(4000) });

export const POST = handle(async (request: Request, ctx: RouteContext<"/api/conversations/[id]/messages">) => {
  const { id } = await ctx.params;
  const app = await getAppContext();
  const { sender, body } = await parseBody(request, Schema);
  if (sender === "mario") {
    const msg = await postMarioMessage(app, id, body);
    return { mode: "mario", messageId: msg.id };
  }
  const res = await postCustomerMessage(app, id, body);
  return {
    mode: res.mode,
    inboundMessageId: res.inboundMessageId,
    turn: res.turn ? { status: res.turn.status, reply: res.turn.reply, agentRunId: res.turn.agentRunId } : null,
  };
});
