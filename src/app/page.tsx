import Link from "next/link";
import { MobileHeader, Page } from "@/components/app/AppShell";
import { AlertCard } from "@/components/app/cards";
import { AlertActions } from "@/components/app/forms";
import { EmptyState, SectionCard, Stat } from "@/components/app/ui";
import { ESCALATION_TRIGGER_LABELS } from "@/domain/enums";
import { getAppContext } from "@/server/app";
import { getDashboard } from "@/server/services/dashboard";

export default async function DashboardPage() {
  const app = await getAppContext();
  const { counts, priorities, marioAlerts } = await getDashboard(app);
  const today = app.clock.now().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  return (
    <>
      <MobileHeader title="Hola, Mario" subtitle={today.charAt(0).toUpperCase() + today.slice(1)} />
      <Page>
        {marioAlerts.length > 0 && (
          <section className="space-y-3">
            {marioAlerts.slice(0, 3).map((a) => (
              <AlertCard key={a.id} severity="high" title="🔥 MARIO, ENTRA TÚ" customerName={a.customerName} detail={`${ESCALATION_TRIGGER_LABELS[a.trigger]} · ${a.payload.recommendedNextStep}`} href={`/customers/${a.customerId}`}>
                <AlertActions alertId={a.id} status={a.status} />
              </AlertCard>
            ))}
            {marioAlerts.length > 3 && (
              <Link href="/alerts" className="block text-center text-sm text-emerald-400">
                Ver {marioAlerts.length - 3} alertas más
              </Link>
            )}
          </section>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Clientes calientes" value={counts.hot} tone="orange" href="/customers?f=hot" />
          <Stat label="Citas de hoy" value={counts.appointmentsToday} tone="blue" href="/customers?f=appointment" />
          <Stat label="Solicitudes pendientes" value={counts.pendingApplications} tone="amber" href="/customers?f=credit" />
          <Stat label="Créditos aprobados" value={counts.approvedCredits} tone="green" href="/alerts" />
          <Stat label="Documentos pendientes" value={counts.pendingDocuments} tone="amber" href="/alerts" />
          <Stat label="Ventas por facturar" value={counts.toInvoice} tone="violet" href="/sales?f=in_process" />
          <Stat label="Unidades por entregar" value={counts.toDeliver} tone="orange" href="/sales?f=to_deliver" />
          <Stat label="Seguimientos atrasados" value={counts.overdueFollowups} tone="red" href="/customers?f=follow_up" />
        </div>

        <SectionCard title="Prioridades de hoy">
          {priorities.length === 0 ? (
            <EmptyState>Nada urgente por ahora.</EmptyState>
          ) : (
            <ul className="-my-2 divide-y divide-zinc-800">
              {priorities.map((p) => (
                <li key={p.customerId}>
                  <Link href={p.href} className="flex min-h-14 items-start gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-semibold text-zinc-50">{p.customerName}</div>
                      {p.vehicle && <div className="text-sm text-zinc-400">{p.vehicle}</div>}
                      {p.lines.map((l) => (
                        <div key={l} className="text-sm text-zinc-300">
                          {l}
                        </div>
                      ))}
                    </div>
                    <span className="text-xl text-zinc-600">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </Page>
    </>
  );
}
