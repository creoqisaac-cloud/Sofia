import { z } from "zod";
import { TEMPERATURES } from "@/domain/enums";
import { getAppContext } from "@/server/app";
import { addColumn, addTag, getBoard, moveCard, removeColumn, removeTag, reorderColumns, updateColumn } from "@/server/desk/pipeline";
import { handle, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = handle(async () => getBoard(await getAppContext()));

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("move"), customerId: z.string().uuid(), columnId: z.string().uuid().nullish(), period: z.string().max(7).optional(), position: z.number().optional() }),
  z.object({ action: z.literal("add_column"), name: z.string().min(1).max(40), color: z.string().max(10).optional(), temperature: z.enum(TEMPERATURES).nullish() }),
  z.object({ action: z.literal("update_column"), id: z.string().uuid(), name: z.string().max(40).optional(), color: z.string().max(10).optional(), temperature: z.enum(TEMPERATURES).nullish() }),
  z.object({ action: z.literal("remove_column"), id: z.string().uuid() }),
  z.object({ action: z.literal("reorder"), ids: z.array(z.string().uuid()).max(30) }),
  z.object({ action: z.literal("add_tag"), customerId: z.string().uuid(), text: z.string().min(1).max(40) }),
  z.object({ action: z.literal("remove_tag"), customerId: z.string().uuid(), tag: z.string().min(1).max(80) }),
]);

export const POST = handle(async (request: Request) => {
  const app = await getAppContext();
  const b = await parseBody(request, Action);
  switch (b.action) {
    case "move":
      await moveCard(app, b.customerId, { columnId: b.columnId ?? undefined, period: b.period, position: b.position });
      return { ok: true };
    case "add_column":
      return addColumn(app, { name: b.name, color: b.color, temperature: b.temperature ?? null });
    case "update_column":
      return updateColumn(app, b.id, { name: b.name, color: b.color, temperature: b.temperature === undefined ? undefined : (b.temperature ?? null) });
    case "remove_column":
      await removeColumn(app, b.id);
      return { ok: true };
    case "reorder":
      await reorderColumns(app, b.ids);
      return { ok: true };
    case "add_tag":
      return { tag: await addTag(app, b.customerId, b.text) };
    case "remove_tag":
      await removeTag(app, b.customerId, b.tag);
      return { ok: true };
  }
});
