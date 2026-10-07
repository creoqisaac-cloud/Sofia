import { z } from "zod";
import { getAppContext } from "@/server/app";
import { handle, parseBody } from "@/server/http";
import { createReminder, upcomingDeviceReminders } from "@/server/services/reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Avisos de los próximos 14 días para programarlos en la tablet (notificaciones locales). */
export const GET = handle(async () => {
  const app = await getAppContext();
  return { reminders: await upcomingDeviceReminders(app), generatedAt: app.clock.now().toISOString() };
});

const CreateSchema = z.object({
  at: z.string().datetime({ offset: true }),
  text: z.string().min(1).max(200),
  alarm: z.boolean().optional(),
  customerId: z.string().uuid().nullish(),
});

/** Nuevo recordatorio de Mario. */
export const POST = handle(async (request: Request) => {
  const app = await getAppContext();
  const body = await parseBody(request, CreateSchema);
  const r = await createReminder(app, { at: new Date(body.at), text: body.text, alarm: body.alarm, customerId: body.customerId ?? null });
  return { reminder: r };
});
