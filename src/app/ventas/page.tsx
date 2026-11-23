import Link from "next/link";
import { MobileHeader, Page } from "@/components/app/AppShell";
import { ChatList } from "@/components/desk/ChatList";
import { DeskTabs } from "@/components/desk/ui";
import { DirectiveBox } from "@/components/desk/DirectiveBox";
import { dayPlaybook } from "@/domain/sales-style";
import { getAppContext } from "@/server/app";
import { listChats } from "@/server/desk/chats";
import { listOutbox } from "@/server/desk/outbox";
import { loadStyle } from "@/server/desk/style";
import { APPOINTMENT_KINDS, listAppointments } from "@/server/services/agenda";

export const dynamic = "force-dynamic";

/** Sofía Ventas: chats, indicaciones y citados en un solo lugar. */
export default async function VentasPage({ searchParams }: { searchParams: Promise<{ i?: string }> }) {
  const { i } = await searchParams;
  const app = await getAppContext();
  const now = app.clock.now();
  const [chats, outbox, style, appts] = await Promise.all([
    listChats(app),
    listOutbox(app),
    loadStyle(app.db, app.workspaceId),
    listAppointments(app, { from: new Date(now.getTime() - 2 * 3600_000), to: new Date(now.getTime() + 2 * 86_400_000), activeOnly: true }),
  ]);
  const play = dayPlaybook(now, style);
  const citados = appts.filter((a) => a.appointment.scheduledAt).slice(0, 8);
  const toAnswer = chats.filter((c) => c.needsReply).length;
  return (
    <>
      <MobileHeader title="Ventas" subtitle={`${play.label}: ${play.focus}`} />
      <Page>
        <DeskTabs counts={{ "/ventas": toAnswer, "/ventas/envios": outbox.length }} />

        {citados.length > 0 && (
          <section className="rounded-3xl bg-panel p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="sofia-title text-[12px] font-semibold text-dim">CITADOS</h2>
              <Link href="/ventas/envios" className="text-[13px] text-sand">
                Confirmar por WhatsApp →
              </Link>
            </div>
            <ul className="mt-2 divide-y divide-line">
              {citados.map((a) => (
                <li key={a.appointment.id}>
                  <Link href={`/ventas/chat/${a.appointment.customerId}`} className="flex min-h-12 items-center gap-3 py-2">
                    <span className="w-24 shrink-0 text-[13px] tabular-nums text-sand">
                      {a.appointment.scheduledAt!.toLocaleString("es-MX", { timeZone: "America/Mexico_City", weekday: "short", hour: "numeric", minute: "2-digit" })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] text-ivory">{(a.customerName ?? "Cliente").replace(/\s*\(DEMO\)\s*/g, " ").trim()}</span>
                    <span className="shrink-0 text-[12px] text-faint">
                      {APPOINTMENT_KINDS[a.appointment.kind] ?? "Cita"}
                      {a.appointment.status === "confirmed" ? " ✓" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <ChatList initial={JSON.parse(JSON.stringify(chats))} />
        <DirectiveBox initial={i ?? ""} />
      </Page>
    </>
  );
}
