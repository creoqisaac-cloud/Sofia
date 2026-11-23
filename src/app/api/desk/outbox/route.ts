import { z } from "zod";
import { getAppContext } from "@/server/app";
import { editOutbox, listOutbox, queueFollowups, resolveOutbox, suggestAppointmentConfirmations, suggestFollowups } from "@/server/desk/outbox";
import { handle, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const status = new URL(request.url).searchParams.get("status");
  return { items: await listOutbox(await getAppContext(), { status: status === "sent" || status === "skipped" ? status : "pending" }) };
});

const Item = z.object({ customerId: z.string().uuid(), body: z.string().min(1).max(3000), mediaIds: z.array(z.string().uuid()).max(6) });
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sent"), id: z.string().uuid(), body: z.string().max(3000).optional() }),
  z.object({ action: z.literal("skipped"), id: z.string().uuid() }),
  z.object({ action: z.literal("edit"), id: z.string().uuid(), body: z.string().min(1).max(3000) }),
  z.object({ action: z.literal("suggest_followups") }),
  z.object({ action: z.literal("suggest_appointments") }),
  z.object({ action: z.literal("queue"), items: z.array(Item).min(1).max(200), kind: z.enum(["followup", "appointment"]).optional() }),
]);

export const POST = handle(async (request: Request) => {
  const app = await getAppContext();
  const b = await parseBody(request, Action);
  switch (b.action) {
    case "sent":
      await resolveOutbox(app, b.id, "sent", b.body);
      return { ok: true };
    case "skipped":
      await resolveOutbox(app, b.id, "skipped");
      return { ok: true };
    case "edit":
      await editOutbox(app, b.id, b.body);
      return { ok: true };
    case "suggest_followups":
      return suggestFollowups(app);
    case "suggest_appointments":
      return { items: await suggestAppointmentConfirmations(app) };
    case "queue":
      return queueFollowups(app, b.items, b.kind ?? "followup");
  }
});
