import { z } from "zod";
import { getAppContext } from "@/server/app";
import { addUnit, addVehicle, addVehicleUpdate, deleteUnit, deleteVehicleUpdate, getModelsOverview, setVehicleUpdate, updateUnit } from "@/server/desk/models";
import { handle, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = handle(async () => getModelsOverview(await getAppContext()));

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish();
const toDate = (d: string | null | undefined) => (d ? new Date(`${d}T23:59:59-06:00`) : null);

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add_update"), vehicleId: z.string().uuid().nullable(), kind: z.string().max(20), text: z.string().min(1).max(600), validTo: date }),
  z.object({ action: z.literal("set_update"), id: z.string().uuid(), active: z.boolean().optional(), text: z.string().max(600).optional(), validTo: date }),
  z.object({ action: z.literal("delete_update"), id: z.string().uuid() }),
  z.object({
    action: z.literal("add_unit"),
    vehicleId: z.string().uuid(),
    versionName: z.string().max(60).nullish(),
    color: z.string().max(40).nullish(),
    modelYear: z.number().int().nullish(),
    status: z.string().max(20).optional(),
    price: z.number().nonnegative().nullish(),
    notes: z.string().max(300).nullish(),
  }),
  z.object({ action: z.literal("update_unit"), id: z.string().uuid(), status: z.string().max(20).optional(), color: z.string().max(40).nullish(), versionName: z.string().max(60).nullish(), notes: z.string().max(300).nullish(), price: z.number().nonnegative().nullish() }),
  z.object({ action: z.literal("delete_unit"), id: z.string().uuid() }),
  z.object({ action: z.literal("add_vehicle"), model: z.string().min(1).max(40), year: z.number().int(), segment: z.string().max(40).nullish(), aliases: z.array(z.string().max(30)).max(8).optional() }),
]);

export const POST = handle(async (request: Request) => {
  const app = await getAppContext();
  const b = await parseBody(request, Action);
  switch (b.action) {
    case "add_update":
      return addVehicleUpdate(app, { vehicleId: b.vehicleId, kind: b.kind, text: b.text, validTo: toDate(b.validTo) });
    case "set_update":
      return setVehicleUpdate(app, b.id, { active: b.active, text: b.text, ...(b.validTo !== undefined ? { validTo: toDate(b.validTo) } : {}) });
    case "delete_update":
      await deleteVehicleUpdate(app, b.id);
      return { ok: true };
    case "add_unit":
      return addUnit(app, b);
    case "update_unit":
      return updateUnit(app, b.id, b);
    case "delete_unit":
      await deleteUnit(app, b.id);
      return { ok: true };
    case "add_vehicle":
      return addVehicle(app, b);
  }
});
