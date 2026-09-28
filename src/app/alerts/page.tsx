import { MobileHeader, Page } from "@/components/app/AppShell";
import { AlertCard } from "@/components/app/cards";
import { AlertActions, ApprovalActions } from "@/components/app/forms";
import { EmptyState, SectionCard } from "@/components/app/ui";
import { ESCALATION_TRIGGER_LABELS } from "@/domain/enums";
import { getAppContext } from "@/server/app";
import { getOperationalAlerts } from "@/server/services/dashboard";
import { getInbox } from "@/server/services/mario";

export default async function AlertsPage() {
  const app = await getAppContext();
  const [inbox, operational] = await Promise.all([getInbox(app), getOperationalAlerts(app)]);
  return (
    <>
      <MobileHeader title="Alertas" subtitle="Internas · sin notificaciones externas todavía" />
      <Page>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">🔥 Mario, entra tú ({inbox.alerts.length})</h2>
          {inbox.alerts.length === 0 && <EmptyState>Nada que requiera tu intervención.</EmptyState>}
          {inbox.alerts.map((a) => (
            <AlertCard key={a.id} severity="high" title={ESCALATION_TRIGGER_LABELS[a.trigger]} customerName={a.customerName} detail={`${a.payload.reasonForEscalation} → ${a.payload.recommendedNextStep}`} href={`/customers/${a.customerId}`}>
              <AlertActions alertId={a.id} status={a.status} />
            </AlertCard>
          ))}
        </section>
        {inbox.approvals.length > 0 && (
          <SectionCard title={`Aprobaciones pendientes (${inbox.approvals.length})`}>
            <ul className="space-y-3">
              {inbox.approvals.map((a) => (
                <li key={a.id} className="rounded-xl bg-ink/60 p-3">
                  <div className="text-base font-semibold text-zinc-100">{a.actionLabel}</div>
                  <div className="text-sm text-zinc-400">
                    {a.customerName} · {a.reason}
                  </div>
                  <div className="mt-2">
                    <ApprovalActions approvalId={a.id} />
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Operación ({operational.length})</h2>
          {operational.length === 0 && <EmptyState>Sin pendientes operativos.</EmptyState>}
          {operational.map((a, i) => (
            <AlertCard key={`${a.type}-${a.customerId}-${i}`} severity={a.severity} title={a.title} customerName={a.customerName} detail={a.detail} href={a.href} />
          ))}
        </section>
      </Page>
    </>
  );
}
