import { desc, eq } from "drizzle-orm";
import { MobileHeader } from "@/components/app/AppShell";
import { NotificationSetup, ReminderForm, RemoveReminderButton } from "@/components/sofia/Reminders";
import { getAppContext } from "@/server/app";
import * as s from "@/server/db/schema";
import { upcomingDeviceReminders } from "@/server/services/reminders";

export const dynamic = "force-dynamic";

const SOURCE: Record<string, string> = { followup: "Seguimiento", appointment: "Cita", reminder: "Recordatorio" };

export default async function RemindersPage() {
  const app = await getAppContext();
  const [upcoming, customers] = await Promise.all([
    upcomingDeviceReminders(app),
    app.db.select({ id: s.customers.id, name: s.customers.displayName }).from(s.customers).where(eq(s.customers.workspaceId, app.workspaceId)).orderBy(desc(s.customers.updatedAt)).limit(200),
  ]);
  return (
    <>
      <MobileHeader title="Recordatorios y alarmas" back="/more" subtitle="Android: alarmas · iPhone: Calendario" />
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-5 pb-10">
        <NotificationSetup />
        <ReminderForm customers={customers.map((c) => ({ id: c.id, name: c.name.replace(/\s*\(DEMO\)\s*/, "") }))} />
        <section className="rounded-3xl bg-panel p-5">
          <div className="text-[16px] text-ivory">Próximos avisos (14 días)</div>
          {upcoming.length === 0 ? (
            <p className="py-3 text-[15px] text-faint">Nada programado. Los seguimientos con fecha, las citas y tus recordatorios aparecen aquí.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {upcoming.map((r) => (
                <li key={r.key} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] text-ivory">{r.alarm ? "⏰ " : ""}{r.title}</div>
                    <div className="text-[13px] text-faint">
                      {new Date(r.at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Monterrey" })} · {SOURCE[r.source]} · {r.body}
                    </div>
                  </div>
                  <a href={`/api/reminders/calendar?key=${encodeURIComponent(r.key)}`}
                    className="min-h-11 rounded-xl bg-raise px-3 py-2 text-center text-[13px] text-sand">
                    Descargar .ics
                  </a>
                  {r.source === "reminder" && <RemoveReminderButton id={r.sourceId} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
