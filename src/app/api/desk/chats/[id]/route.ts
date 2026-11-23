import { z } from "zod";
import { getAppContext } from "@/server/app";
import { getChat, markReplyDelivered, regenerateReply } from "@/server/desk/chats";
import { previewDirective } from "@/server/desk/outbox";
import { handle, parseBody } from "@/server/http";
import { setControlMode } from "@/server/services/conversation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/desk/chats/[id]">) => {
  const { id } = await ctx.params;
  return getChat(await getAppContext(), id);
});

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("regenerate") }),
  z.object({ action: z.literal("delivered"), messageId: z.string().uuid() }),
  z.object({ action: z.literal("control"), conversationId: z.string().uuid(), mode: z.enum(["sofia", "mario"]) }),
  z.object({ action: z.literal("directive_preview"), text: z.string().min(1).max(1500) }),
]);

export const POST = handle(async (request: Request, ctx: RouteContext<"/api/desk/chats/[id]">) => {
  const { id } = await ctx.params;
  const app = await getAppContext();
  const body = await parseBody(request, Action);
  switch (body.action) {
    case "regenerate":
      return regenerateReply(app, id);
    case "delivered":
      await markReplyDelivered(app, body.messageId);
      return { ok: true };
    case "control":
      await setControlMode(app, body.conversationId, body.mode);
      return { ok: true };
    case "directive_preview":
      return previewDirective(app, body.text, { customerId: id });
  }
});
