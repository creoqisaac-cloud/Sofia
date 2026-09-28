import Link from "next/link";
import { MobileHeader, Page } from "@/components/app/AppShell";
import { SaleCard } from "@/components/app/cards";
import { ChipNav, EmptyState } from "@/components/app/ui";
import { getAppContext } from "@/server/app";
import { listSales, SALE_FILTERS, type SaleFilter } from "@/server/services/sales";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const filter = (f && f in SALE_FILTERS ? f : "all") as SaleFilter;
  const app = await getAppContext();
  const sales = await listSales(app, filter);
  return (
    <>
      <MobileHeader title="Ventas" subtitle={`${sales.length} ${SALE_FILTERS[filter].label.toLowerCase()}`} action={
          <span className="flex gap-3 text-sm">
            <a href="/api/sales/export" className="text-sand">Exportar Excel</a>
            <Link href="/sales/table" className="hidden text-sand md:inline">Tabla de control</Link>
          </span>
        } />
      <Page>
        <ChipNav active={filter} items={Object.entries(SALE_FILTERS).map(([key, v]) => ({ key, label: v.label, href: key === "all" ? "/sales" : `/sales?f=${key}` }))} />
        {sales.length === 0 ? (
          <EmptyState>No hay ventas con este filtro. Una venta se crea desde el cliente (cotización o crédito aprobado).</EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {sales.map((s) => (
              <SaleCard key={s.id} s={s} />
            ))}
          </div>
        )}
      </Page>
    </>
  );
}
