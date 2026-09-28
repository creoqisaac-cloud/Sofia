import { MobileHeader, Page } from "@/components/app/AppShell";
import { CreditApplicationCard } from "@/components/app/cards";
import { ImportApplicationForm, NewApplicationButtons } from "@/components/app/forms";
import { EmptyState, SectionCard } from "@/components/app/ui";
import { getAppContext } from "@/server/app";
import { listCustomerApplications, listInstitutions } from "@/server/services/credit";
import { getCustomerOverview } from "@/server/services/customer-overview";

export default async function CreditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await getAppContext();
  const [o, applications, institutions] = await Promise.all([getCustomerOverview(app, id), listCustomerApplications(app, id), listInstitutions(app)]);
  const inst = institutions.map((i) => ({ code: i.code, name: i.name }));
  return (
    <>
      <MobileHeader back={`/customers/${id}`} title="Crédito" subtitle={o.customer.displayName} />
      <Page>
        <SectionCard title="Nueva solicitud" subtitle="Sofía reutiliza el perfil del cliente; solo capturas lo que falte.">
          <NewApplicationButtons customerId={id} institutions={inst} />
        </SectionCard>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Solicitudes ({applications.length})</h2>
          {applications.length === 0 ? <EmptyState>Este cliente aún no tiene solicitudes.</EmptyState> : applications.map((a) => <CreditApplicationCard key={a.id} a={a} customerId={id} />)}
        </div>
        <SectionCard title="Leer una solicitud previa (PDF llenado)" subtitle="Útil cuando el cliente ya llenó BBVA o Banorte: sus datos entran con fuente y cualquier diferencia queda como conflicto.">
          <ImportApplicationForm customerId={id} institutions={inst} />
        </SectionCard>
      </Page>
    </>
  );
}
