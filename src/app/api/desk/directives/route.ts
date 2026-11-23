import { z } from "zod";
import { getAppContext } from "@/server/app";
import { commitDirective, previewDirective } from "@/server/desk/outbox";
import { handle, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), text: z.string().min(1).max(1500) }),
  z.object({
    action: z.literal("commit"),
    text: z.string().min(1).max(1500),
    plan: z.record(z.string(), z.unknown()),
    dueAt: z.string().datetime().nullish(),
    items: z
      .array(z.object({ customerId: z.string().uuid(), body: z.string().min(1).max(3000), mediaIds: z.array(z.string().uuid()).max(6), kind: z.string().max(20).optional() }))
      .min(1)
      .max(200),
  }),
]);

/** Indicaciones de Mario a Sofía: vista previa (no guarda) y confirmación (a la cola de envíos). */
export const POST = handle(async (request: Request) => {
  const app = await getAppContext();
  const b = await parseBody(request, Action);
  if (b.action === "preview") return previewDirective(app, b.text);
  return commitDirective(app, { text: b.text, plan: b.plan, items: b.items, dueAt: b.dueAt ?? null });
});
