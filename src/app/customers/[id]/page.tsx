import Link from "next/link";
import { notFound } from "next/navigation";
import { SofiaCommand } from "@/components/sofia/SofiaCommand";
import { IconChevron, IconPhone } from "@/components/sofia/icons";
import { CREDIT_APPLICATION_STATUS_LABELS, CRM_STAGE_LABELS, SALE_STATUS_LABELS, TEMPERATURE_LABELS } from "@/domain/enums";
import { salePendingItems } from "@/domain/sales";
import { getFollowupSummary, RESPONSE_STATUS_LABELS } from "@/server/services/agenda";
import { listPlateCases, PLATE_STATUS_LABELS, plateMissing, type PlateStatus } from "@/server/services/plates";
import { listQuoteRuns } from "@/server/services/quote-v2";
import { CustomerNumberForm, FollowupButtons, MarioQuoteForm } from "@/components/sofia/tablet";
import { ReminderForm } from "@/components/sofia/Reminders";
import { catalogModels } from "@/server/command/router";
import { isTabletMode } from "@/server/pilot";
import { getTabletSummary } from "@/server/services/tablet";
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
  if (active === "resumen" && (await isTabletMode())) return <TabletCustomer id={id} app={app} />;
  if (active === "resumen") return <CustomerHome o={o} id={id} app={app} />;
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
        back={`/customers/${id}`}
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

/** Ficha rediseñada: nombre, siguiente acción y secciones en una línea (el detalle al tocar). */
async function CustomerHome({ o, id, app }: { o: Awaited<ReturnType<typeof getCustomerOverview>>; id: string; app: Awaited<ReturnType<typeof getAppContext>> }) {
  const now = app.clock.now();
  const [fu, plates, runs] = await Promise.all([getFollowupSummary(app, id), listPlateCases(app, { customerId: id, openOnly: true }), listQuoteRuns(app, { customerId: id, savedOnly: true, limit: 1 })]);
  const sale = o.sales[0];
  const salePend = sale ? salePendingItems(sale, now) : [];
  const appl = o.applications.find((a) => !["cancelled", "rejected"].includes(a.status)) ?? o.applications[0];
  const missingDocs = o.documents.filter((d) => d.requiredBy.length && ["missing", "requested", "rejected"].includes(d.status));
  const nextAppt = o.appointments.find((a) => a.scheduledAt && a.scheduledAt >= now && ["scheduled", "confirmed", "proposed"].includes(a.status));
  const plate = plates[0]?.plate;
  const fmt = (d: Date | null | undefined, time = false) => (d ? d.toLocaleString("es-MX", time ? { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false } : { day: "numeric", month: "short" }) : "—");

  // Siguiente acción: la más concreta disponible.
  const next =
    o.conflicts.length && appl
      ? { text: `Resolver ${o.conflicts.length} dato(s) que no coinciden`, label: "Resolver", href: `/customers/${id}/credit/${appl.id}?step=completar` }
      : appl?.status === "approved" && sale && salePend.length
        ? { text: `Crédito aprobado · ${salePend[0]}`, label: "Continuar venta", href: `/sales/${sale.id}` }
        : missingDocs.length
          ? { text: `Falta ${missingDocs.map((d) => d.label.toLowerCase()).join(", ")}`, label: "Solicitar documento", href: `/customers/${id}?tab=documentos` }
          : fu.next
            ? { text: `${fu.next.reason} · ${fmt(fu.next.dueAt, true)}`, label: fu.next.action ?? "Seguimiento", href: `/agenda#seguimiento` }
            : plate && plateMissing(plate).length
              ? { text: `Placas: falta ${plateMissing(plate)[0]!.toLowerCase()}`, label: "Ver placas", href: `/plates/${plate.id}` }
              : { text: o.summary?.nextAction?.description ?? "Sin acción pendiente registrada", label: "Crear seguimiento", href: `/agenda?new=${id}` };

  const rows: Array<{ label: string; value: string; href: string; warn?: boolean }> = [
    { label: "Cotizaciones", value: o.quotes.length ? `${o.quotes.length} · última ${o.quotes[0]!.vehicleLabel} ${o.quotes[0]!.effectiveLabel.toLowerCase()}` : runs.length ? "Corrida guardada" : "Sin cotizaciones", href: `/customers/${id}?tab=cotizaciones` },
    { label: "Solicitud", value: appl ? `${appl.institutionName} · ${CREDIT_APPLICATION_STATUS_LABELS[appl.status]}` : "Sin solicitud", href: `/customers/${id}?tab=credito`, warn: appl?.status === "conflict" || appl?.status === "missing_information" },
    { label: "Seguimiento", value: `${fu.lastContactAt ? `Último contacto ${fmt(fu.lastContactAt)}` : "Sin contacto registrado"}${fu.responseStatus !== "none" ? ` · ${RESPONSE_STATUS_LABELS[fu.responseStatus]}` : ""}${fu.promise ? " · promesa pendiente" : ""}`, href: `/agenda#seguimiento`, warn: Boolean(fu.promise) },
    { label: "Citas", value: nextAppt ? fmt(nextAppt.scheduledAt, true) : "Sin cita próxima", href: `/customers/${id}?tab=citas` },
    { label: "Venta", value: sale ? `${SALE_STATUS_LABELS[sale.status]}${salePend.length ? ` · ${salePend[0]}` : ""}` : "Sin venta", href: sale ? `/sales/${sale.id}` : `/customers/${id}?tab=ventas`, warn: salePend.length > 0 },
    { label: "Placas", value: plate ? `${PLATE_STATUS_LABELS[plate.status as PlateStatus]}${plateMissing(plate).length ? ` · faltan ${plateMissing(plate).length}` : ""}` : "Sin trámite", href: plate ? `/plates/${plate.id}` : `/plates/new?customer=${id}` },
    { label: "Documentos", value: missingDocs.length ? `Faltan ${missingDocs.length}` : "Completos", href: `/customers/${id}?tab=documentos`, warn: missingDocs.length > 0 },
    { label: "Datos del cliente", value: o.conflicts.length ? `${o.conflicts.length} conflicto(s)` : "Perfil", href: `/customers/${id}?tab=datos`, warn: o.conflicts.length > 0 },
  ];

  return (
    <>
      <MobileHeader back="/customers" title="" />
      <div className="mx-auto flex max-w-xl flex-col px-4 pb-8">
        <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-ivory">
          {o.customer.displayName.replace(/\s*\(DEMO\)\s*/, "")}
          {o.customer.isDemo && <span className="ml-2 align-middle text-[11px] tracking-wider text-faint">DEMO</span>}
        </h1>
        <p className="mt-1 text-[15px] text-dim">
          {[o.vehicle ?? "Sin vehículo de interés", CRM_STAGE_LABELS[o.crm.stage], TEMPERATURE_LABELS[o.crm.temperature]].join(" · ")}
        </p>
        {o.phone && (
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`tel:${o.phone}`} className="flex min-h-11 items-center gap-2 rounded-full bg-panel px-4 text-[15px] text-ivory">
              <IconPhone width={17} height={17} /> Llamar
            </a>
            <Link href={`/whatsapp?cliente=${id}`} className="flex min-h-11 items-center rounded-full bg-sand px-4 text-[15px] font-semibold text-ink">
              💬 Preparar WhatsApp
            </Link>
          </div>
        )}

        <section className="mt-6 rounded-3xl bg-panel p-5">
          <div className="sofia-title text-[11px] font-semibold text-dim">SIGUIENTE ACCIÓN</div>
          <p className="mt-2 text-[18px] leading-snug text-ivory">{next.text}</p>
          <Link href={next.href} className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-sand text-[16px] font-semibold text-ink">
            {next.label}
          </Link>
        </section>

        <ul className="mt-6 divide-y divide-line">
          {rows.map((r) => (
            <li key={r.label}>
              <Link href={r.href} className="flex min-h-14 items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] text-ivory">{r.label}</div>
                  <div className={`truncate text-[14px] ${r.warn ? "text-alert" : "text-dim"}`}>{r.value}</div>
                </div>
                <IconChevron className="shrink-0 text-faint" width={18} height={18} />
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-4 text-[14px] text-faint">
          <Link href={`/customers/${id}?tab=conversacion`}>Conversación</Link>
          <Link href={`/customers/${id}?tab=historial`}>Historial</Link>
        </div>

        <div className="mt-8">
          <div className="mb-2 text-[13px] text-dim">Pregúntale a Sofía sobre este cliente</div>
          <SofiaCommand placeholder="¿Qué le falta? · Agenda mañana a las 5…" customerId={id} />
        </div>
      </div>
    </>
  );
}

/** Ficha tablet: entender al cliente en menos de 10 segundos y actuar. */
async function TabletCustomer({ id, app }: { id: string; app: Awaited<ReturnType<typeof getAppContext>> }) {
  const [t, plates, models] = await Promise.all([getTabletSummary(app, id), listPlateCases(app, { customerId: id, openOnly: true }), catalogModels(app)]);
  const name = t.customer.displayName.replace(/\s*\(DEMO\)\s*/, "");
  const lines: Array<[string, string | null, boolean?]> = [
    ["Necesidad", t.need],
    ["Cotización enviada", t.quote],
    ["Último contacto", t.lastContact],
    ["Está esperando", t.waitingFor],
    ["Siguiente acción", t.nextAction ? `${t.nextAction.text} · ${t.nextAction.when ?? "sin fecha"}${t.nextAction.overdue ? " (vencida)" : ""}` : null, t.nextAction?.overdue],
    ["Cita", t.appointment?.when ?? null],
  ];
  const plate = plates[0]?.plate;
  const step = "flex min-h-20 items-center justify-between gap-3 rounded-3xl bg-panel px-5 py-4 active:bg-raise";
  return (
    <>
      <MobileHeader back="/customers" title="" />
      <div className="mx-auto flex max-w-3xl flex-col px-5 pb-10">
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-ivory">
          {name}
          {t.customer.isDemo && <span className="ml-2 align-middle text-[11px] tracking-wider text-faint">DEMO</span>}
        </h1>
        <div className="mt-1">
          <CustomerNumberForm customerId={id} value={t.customerNumber} />
        </div>

        <dl className="mt-5 grid gap-x-6 gap-y-3 rounded-3xl bg-panel p-5 sm:grid-cols-2">
          {lines.map(([label, value, warn]) => (
            <div key={label}>
              <dt className="text-[12px] tracking-wide text-faint">{label}</dt>
              <dd className={`text-[16px] leading-snug ${value ? (warn ? "text-alert" : "text-ivory") : "text-faint"}`}>{value ?? "—"}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5">
          <FollowupButtons customerId={id} followupId={t.nextAction?.id ?? null} phone={t.phone} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link href={`/whatsapp?cliente=${id}`} className="flex min-h-14 items-center justify-center rounded-2xl bg-sand px-4 text-[15px] font-semibold text-ink">
            💬 WhatsApp para este cliente
          </Link>
          <Link href="/correos" className="flex min-h-14 items-center justify-center rounded-2xl bg-raise px-4 text-[15px] text-ivory">
            ✉️ Asistente de correos
          </Link>
        </div>
        <div className="mt-4">
          <ReminderForm customerId={id} />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href={`/customers/${id}/documents`} className={step}>
            <span>
              <span className="block text-[18px] text-ivory">1 · Documentos</span>
              <span className={`block text-[14px] ${t.inbox.pendingReview ? "text-alert" : "text-dim"}`}>
                {t.inbox.total ? `${t.inbox.total} subido(s)${t.inbox.pendingReview ? ` · ${t.inbox.pendingReview} dato(s) por revisar` : ""}` : "Subir documentos"}
              </span>
            </span>
            <IconChevron className="text-faint" />
          </Link>
          <Link href={`/customers/${id}/credit`} className={step}>
            <span>
              <span className="block text-[18px] text-ivory">2 · Solicitud</span>
              <span className="block text-[14px] text-dim">{t.applications.length ? t.applications.slice(0, 2).map((a) => `${a.institution}: ${CREDIT_APPLICATION_STATUS_LABELS[a.status]}`).join(" · ") : "BBVA o Banorte"}</span>
            </span>
            <IconChevron className="text-faint" />
          </Link>
          <Link href={plate ? `/plates/${plate.id}` : `/plates/new?customer=${id}`} className={step}>
            <span>
              <span className="block text-[18px] text-ivory">Placas</span>
              <span className="block text-[14px] text-dim">{plate ? `${PLATE_STATUS_LABELS[plate.status as PlateStatus]}${plateMissing(plate).length ? ` · faltan ${plateMissing(plate).length}` : ""}` : "Sin trámite"}</span>
            </span>
            <IconChevron className="text-faint" />
          </Link>
          <Link href={`/customers/${id}?tab=datos`} className={step}>
            <span>
              <span className="block text-[18px] text-ivory">Datos del cliente</span>
              <span className="block text-[14px] text-dim">{t.missingDocs.length ? `Faltan: ${t.missingDocs.slice(0, 2).join(", ")}` : "Perfil y conflictos"}</span>
            </span>
            <IconChevron className="text-faint" />
          </Link>
        </div>

        <details className="mt-6">
          <summary className="cursor-pointer text-[15px] text-sand">{t.hasMarioQuote ? "Registrar otra cotización enviada" : "Registrar la cotización que enviaste"}</summary>
          <div className="mt-3">
            <MarioQuoteForm customerId={id} models={models} />
          </div>
        </details>
      </div>
    </>
  );
}
