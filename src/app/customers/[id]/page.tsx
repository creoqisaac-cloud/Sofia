import { notFound } from "next/navigation";
import { MobileHeader, Page } from "@/components/app/AppShell";
import { AppointmentsTab, ConversationTab, CreditTab, DataTab, DocumentsTab, HistoryTab, QuotesTab, SalesTab, SummaryTab } from "@/components/app/customer-tabs";
import { ChipNav, DemoPill, StageBadge, TemperatureBadge } from "@/components/app/ui";
import { getAppContext } from "@/server/app";
import { getCustomerOverview } from "@/server/services/customer-overview";
import { ServiceError } from "@/server/services/errors";

const TABS = [
  ["resumen", "Resumen"],
  ["datos", "Datos"],
  ["conversacion", "Conversación"],
  ["cotizaciones", "Cotizaciones"],
  ["credito", "Crédito"],
  ["documentos", "Documentos"],
  ["ventas", "Ventas"],
  ["citas", "Citas"],
  ["historial", "Historial"],
] as const;

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; s?: string }> }) {
  const { id } = await params;
  const { tab = "resumen", s = "" } = await searchParams;
  const app = await getAppContext();
  let o;
  try {
    o = await getCustomerOverview(app, id);
  } catch (e) {
    if (e instanceof ServiceError && e.status === 404) notFound();
    throw e;
  }
  const active = TABS.some(([k]) => k === tab) ? tab : "resumen";
  const counts: Record<string, number> = {
    cotizaciones: o.quotes.length,
    credito: o.applications.length,
    ventas: o.sales.length,
    datos: o.conflicts.length,
    documentos: o.documents.filter((d) => d.requiredBy.length && d.status === "missing").length,
  };
  return (
    <>
      <MobileHeader
        back="/customers"
        title={o.customer.displayName}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5 pt-1">
            <StageBadge stage={o.crm.stage} />
            <TemperatureBadge temperature={o.crm.temperature} />
            {o.vehicle && <span className="text-zinc-400">{o.vehicle}</span>}
            <DemoPill show={o.customer.isDemo} />
          </span>
        }
      />
      <Page>
        <ChipNav active={active} items={TABS.map(([k, label]) => ({ key: k, label, href: `/customers/${id}?tab=${k}`, count: counts[k] }))} />
        {active === "resumen" && <SummaryTab o={o} />}
        {active === "datos" && <DataTab o={o} section={s} />}
        {active === "conversacion" && <ConversationTab o={o} />}
        {active === "cotizaciones" && <QuotesTab o={o} />}
        {active === "credito" && <CreditTab o={o} />}
        {active === "documentos" && <DocumentsTab o={o} />}
        {active === "ventas" && <SalesTab o={o} />}
        {active === "citas" && <AppointmentsTab o={o} />}
        {active === "historial" && <HistoryTab o={o} />}
      </Page>
    </>
  );
}
