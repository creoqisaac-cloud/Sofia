import Link from "next/link";
import { notFound } from "next/navigation";
import { MobileHeader, Page } from "@/components/app/AppShell";
import { SALE_TONE, StatusTimeline } from "@/components/app/cards";
import { SaleSectionForm, SaleStatusForm } from "@/components/app/forms";
import { DemoPill, KeyValue, Pill, SectionCard, fmtDate, fmtMoney } from "@/components/app/ui";
import { CREDIT_APPLICATION_STATUS_LABELS, SALE_STATUSES, SALE_STATUS_LABELS } from "@/domain/enums";
import { SALE_FIELDS, SALE_SECTION_LABELS, SALE_SECTIONS, type SaleSection } from "@/domain/sales";
import { getAppContext } from "@/server/app";
import { ServiceError } from "@/server/services/errors";
import { getSaleDetail } from "@/server/services/sales";

const FIELD_LABEL = Object.fromEntries(SALE_FIELDS.map((f) => [f.key, f.label])) as Record<string, string>;
const EDIT_SECTIONS: readonly SaleSection[] = SALE_SECTIONS;

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString("es-MX");
  if (typeof v === "string" && SALE_STATUSES.includes(v as never)) return SALE_STATUS_LABELS[v as keyof typeof SALE_STATUS_LABELS];
  if (typeof v === "object") return "—";
  return String(v);
}

export default async function SalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const { edit } = await searchParams;
  let d;
  try {
    d = await getSaleDetail(await getAppContext(), id);
  } catch (e) {
    if (e instanceof ServiceError && e.status === 404) notFound();
    throw e;
  }
  const { sale } = d;
  const val = (k: string) => {
    const v = (sale as Record<string, unknown>)[k];
    return v instanceof Date ? v.toISOString().slice(0, 10) : (v as string | number | null);
  };
  const editing = EDIT_SECTIONS.includes(edit as SaleSection) ? (edit as SaleSection) : null;
  const sectionView = (section: SaleSection) => {
    const fields = SALE_FIELDS.filter((f) => f.section === section);
    return (
      <SectionCard key={section} id={section} title={SALE_SECTION_LABELS[section]} action={editing === section ? <Link href={`/sales/${id}#${section}`} className="text-sm text-zinc-400">Cerrar</Link> : <Link href={`/sales/${id}?edit=${section}#${section}`} className="text-sm text-sand">Editar</Link>}>
        {editing === section ? (
          <SaleSectionForm saleId={id} section={section} fields={fields.map((f) => ({ key: f.key, label: f.label, type: f.type, value: val(f.key) }))} />
        ) : (
          <KeyValue items={fields.map((f) => ({ k: f.label, v: f.type === "money" ? fmtMoney(sale[f.key] as number | null) : f.type === "date" ? fmtDate(sale[f.key] as Date | null) : show(sale[f.key]) }))} />
        )}
      </SectionCard>
    );
  };
  return (
    <>
      <MobileHeader
        back="/sales"
        title={sale.customerName}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5 pt-1">
            <Pill tone={SALE_TONE[sale.status]}>{SALE_STATUS_LABELS[sale.status]}</Pill>
            <span className="text-zinc-400">{sale.unitDescription ?? "Unidad por definir"}</span>
            <DemoPill show={sale.isDemo} />
          </span>
        }
      />
      <Page>
        <SectionCard title="Resumen">
          <KeyValue
            items={[
              { k: "Valor factura", v: fmtMoney(sale.invoiceValue) },
              { k: "Enganche", v: fmtMoney(sale.downPayment) },
              { k: "Bono", v: fmtMoney(sale.bonus) },
              { k: "Pedido / factura", v: `${sale.orderNumber ?? "—"} / ${sale.invoiceNumber ?? "—"}` },
              { k: "Entrega", v: fmtDate(sale.deliveryDate) },
            ]}
          />
          {d.pending.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {d.pending.map((p) => (
                <Pill key={p} tone={p.includes("vencida") ? "red" : "amber"}>
                  {p}
                </Pill>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-faint">Comisión: pendiente de reglas de Mario (no se calcula).</p>
        </SectionCard>
        <SectionCard title="Estado">
          <SaleStatusForm saleId={id} current={sale.status} options={SALE_STATUSES.map((s) => ({ value: s, label: SALE_STATUS_LABELS[s] }))} />
        </SectionCard>
        <SectionCard title="Cliente">
          <KeyValue items={[{ k: "Cliente", v: <Link href={`/customers/${d.customer.id}`} className="text-sand">{d.customer.displayName}</Link> }, { k: "Celular", v: d.customer.phone ?? "—" }, { k: "Número de cliente", v: sale.customerNumber ?? "—" }]} />
          <Link href={`/sales/${id}?edit=cliente#cliente`} className="mt-2 block text-sm text-sand">Editar datos de cliente en la venta</Link>
        </SectionCard>
        {editing === "cliente" && sectionView("cliente")}
        {sectionView("vehiculo")}
        <SectionCard title="Cotización">
          {d.quote ? (
            <KeyValue
              items={[
                { k: "Tipo", v: d.quote.calculationType === "validated_template" ? "Corrida validada" : d.quote.calculationType === "official" ? "Oficial" : "Estimación" },
                { k: "Enganche", v: fmtMoney(d.quote.downPayment) },
                { k: "Plazo", v: d.quote.termMonths ? `${d.quote.termMonths} meses` : "—" },
                { k: "Mensualidad", v: fmtMoney(d.quote.monthlyPayment) },
                { k: "Bono", v: fmtMoney(d.quote.bonus) },
              ]}
            />
          ) : (
            <p className="text-sm text-faint">Venta sin cotización asociada.</p>
          )}
        </SectionCard>
        <SectionCard title="Crédito">
          {d.credit ? (
            <Link href={`/customers/${d.customer.id}/credit/${d.credit.application.id}`} className="flex items-center justify-between text-base text-zinc-100">
              Solicitud {d.credit.institution.name}
              <Pill>{CREDIT_APPLICATION_STATUS_LABELS[d.credit.application.status]}</Pill>
            </Link>
          ) : (
            <p className="text-sm text-faint">Sin solicitud de crédito asociada.</p>
          )}
        </SectionCard>
        {(["montos", "bono", "seguro", "garantia", "adicionales", "facturacion", "entrega", "acuerdos"] as SaleSection[]).map(sectionView)}
        <SectionCard title="Historial">
          <StatusTimeline
            items={d.changes.map((c) => ({
              id: c.id,
              title: c.field === "created" ? "Venta creada" : `${FIELD_LABEL[c.field] ?? (c.field === "status" ? "Estado" : c.field)}: ${show(c.oldValue)} → ${show(c.newValue)}`,
              detail: c.reason,
              at: c.createdAt,
              actor: c.actorType,
            }))}
          />
        </SectionCard>
      </Page>
    </>
  );
}
