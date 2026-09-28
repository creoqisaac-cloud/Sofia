import Link from "next/link";
import { MobileHeader } from "@/components/app/AppShell";
import { AppointmentButtons, NewAgendaItem } from "@/components/sofia/AgendaForms";
import { TodayList } from "@/components/sofia/TodayList";
import { getAppContext } from "@/server/app";
import * as s from "@/server/db/schema";
import { DAY_MS } from "@/server/lib/clock";
import { APPOINTMENT_KINDS, APPOINTMENT_STATUS_LABELS, listAppointments, listPendingFollowups, type AppointmentStatus } from "@/server/services/agenda";
import { getTodayItems } from "@/server/services/today";
import { eq } from "drizzle-orm";

const short = (n: string) => n.replace(/\s*\(DEMO\)\s*/, "");

/** Agenda: citas (hoy y próximas) + seguimiento con clientes. */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: newFor } = await searchParams;
  const app = await getAppContext();
  const now = app.clock.now();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const [appts, today, customers, pending] = await Promise.all([
    listAppointments(app, { from: start, to: new Date(start.getTime() + 30 * DAY_MS) }),
    getTodayItems(app),
    app.db.select({ id: s.customers.id, name: s.customers.displayName, phone: s.customers.phone, isDemo: s.customers.isDemo }).from(s.customers).where(eq(s.customers.workspaceId, app.workspaceId)),
    listPendingFollowups(app),
  ]);
  // Todos los seguimientos pendientes (no solo el principal de HOY) + clientes sin respuesta.
  const fmt = (d: Date | null) => (d ? d.toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "sin fecha");
  const follow = [
    ...pending.map(({ followup: f, customerName }) => {
      const c = customers.find((x) => x.id === f.customerId);
      const overdue = f.dueAt !== null && f.dueAt < start;
      return {
        key: `fu:${f.id}`,
        kind: f.promisedByMario ? "promise" : "followup",
        customerId: f.customerId,
        title: short(customerName),
        detail: `${f.promisedByMario ? "Le prometiste: " : ""}${f.reason} · ${overdue ? "vencido · " : ""}${fmt(f.dueAt)}`,
        actionLabel: f.action ?? "Seguimiento",
        href: `/customers/${f.customerId}`,
        followupId: f.id,
        phone: today.find((t) => t.customerId === f.customerId)?.phone ?? c?.phone ?? null,
        isDemo: Boolean(c?.isDemo),
      };
    }),
    ...today.filter((i) => ["no_response", "quote_waiting"].includes(i.kind)),
  ];
  const dayLabel = (d: Date) => {
    const diff = Math.floor((d.getTime() - start.getTime()) / DAY_MS);
    return diff === 0 ? "Hoy" : diff === 1 ? "Mañana" : d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" });
  };
  const groups = new Map<string, typeof appts>();
  for (const a of appts) {
    const k = dayLabel(a.appointment.scheduledAt!);
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return (
    <>
      <MobileHeader title="Agenda" subtitle="Citas y seguimiento" />
      <div className="mx-auto flex max-w-xl flex-col gap-8 px-4 pb-8">
        {newFor && <NewAgendaItem customers={customers.map((c) => ({ id: c.id, name: short(c.name) }))} defaultCustomerId={newFor !== "1" ? newFor : undefined} today={todayIso} />}

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="sofia-title text-[12px] font-semibold text-dim">CITAS</h2>
            {!newFor && (
              <Link href="/agenda?new=1" className="text-[15px] text-sand">
                + Nueva
              </Link>
            )}
          </div>
          {appts.length === 0 && <p className="py-4 text-[15px] text-faint">Sin citas en los próximos 30 días.</p>}
          {[...groups.entries()].map(([day, list]) => (
            <div key={day} className="mt-3">
              <div className="text-[13px] capitalize text-faint">{day}</div>
              <ul className="divide-y divide-line">
                {list.map(({ appointment: a, customerName }) => (
                  <li key={a.id} id={a.id} className="py-3">
                    <Link href={`/customers/${a.customerId}`} className="flex items-baseline gap-3">
                      <span className="tabular w-14 shrink-0 text-[17px] text-sand">{a.scheduledAt!.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[17px] text-ivory">{short(customerName)}</span>
                        <span className="block text-[14px] text-dim">
                          {APPOINTMENT_KINDS[a.kind] ?? "Cita"} · {APPOINTMENT_STATUS_LABELS[a.status as AppointmentStatus] ?? a.status}
                          {a.location ? ` · ${a.location}` : ""}
                          {a.notes ? ` · ${a.notes}` : ""}
                        </span>
                      </span>
                    </Link>
                    <div className="pl-[4.25rem]">
                      <AppointmentButtons id={a.id} status={a.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section id="seguimiento">
          <div className="flex items-baseline justify-between">
            <h2 className="sofia-title text-[12px] font-semibold text-dim">SEGUIMIENTO</h2>
            <span className="text-[13px] text-faint">{follow.length} pendiente(s)</span>
          </div>
          <TodayList items={follow} />
        </section>
      </div>
    </>
  );
}
