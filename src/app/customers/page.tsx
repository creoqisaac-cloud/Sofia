import { MobileHeader, Page } from "@/components/app/AppShell";
import { CustomerCard } from "@/components/app/cards";
import { ChipNav, EmptyState, LinkButton } from "@/components/app/ui";
import { getAppContext } from "@/server/app";
import { CUSTOMER_FILTERS, listCustomersForApp, type CustomerFilter } from "@/server/services/dashboard";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const { f, q } = await searchParams;
  const filter = (f && f in CUSTOMER_FILTERS ? f : "all") as CustomerFilter;
  const app = await getAppContext();
  const customers = await listCustomersForApp(app, filter, q ?? "");
  const now = app.clock.now();
  return (
    <>
      <MobileHeader title="Clientes" subtitle={`${customers.length} ${filter === "all" ? "en total" : CUSTOMER_FILTERS[filter].label.toLowerCase()}`} action={<LinkButton href="/customers/new">+ Nuevo</LinkButton>} />
      <Page>
        <form className="relative">
          {filter !== "all" && <input type="hidden" name="f" value={filter} />}
          <input name="q" defaultValue={q ?? ""} type="search" placeholder="Buscar por nombre o modelo" className="block min-h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-base text-zinc-100 placeholder:text-faint" />
        </form>
        <ChipNav active={filter} items={Object.entries(CUSTOMER_FILTERS).map(([key, v]) => ({ key, label: v.label, href: key === "all" ? "/customers" : `/customers?f=${key}` }))} />
        {customers.length === 0 ? (
          <EmptyState action={<LinkButton href="/customers/new">Crear cliente</LinkButton>}>No hay clientes con este filtro.</EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {customers.map((c) => (
              <CustomerCard key={c.id} c={c} now={now} />
            ))}
          </div>
        )}
      </Page>
    </>
  );
}
