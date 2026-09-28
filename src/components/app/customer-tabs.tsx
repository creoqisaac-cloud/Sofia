/**
 * Pestañas del detalle de cliente (componentes de servidor).
 */
import Link from "next/link";
import { CRM_STAGE_LABELS, DOCUMENT_STATUS_LABELS, ESCALATION_TRIGGER_LABELS, FACT_SOURCE_LABELS, TEMPERATURE_LABELS, type CrmStage, type FactSourceType, type Temperature } from "@/domain/enums";
import { PROFILE_SECTION_LABELS, type ProfileSection } from "@/domain/profile-fields";
import type { CustomerOverview } from "@/server/services/customer-overview";
import { AlertCard, CreditApplicationCard, MissingDataCard, QuoteCard, SaleCard, StatusTimeline } from "./cards";
import { AlertActions, ConfirmAllButton, ConfirmFactButton, ConflictCard, CreateSaleButton, DocumentChecklist, ProfileSectionForm, RegisterScenarioForm, ScenarioLookupForm, type EditableField } from "./forms";
import { ChipNav, EmptyState, KeyValue, LinkButton, Pill, SectionCard, fmtDate, fmtMoney } from "./ui";

type O = CustomerOverview;

export function SummaryTab({ o }: { o: O }) {
  const approved = o.applications.find((a) => a.status === "approved");
  const missingDocs = o.documents.filter((d) => d.requiredBy.length > 0 && d.status === "missing").map((d) => d.label);
  const latestQuote = o.quotes.find((q) => !q.expired);
  return (
    <>
      {o.alerts.map((a) => (
        <AlertCard key={a.id} severity="high" title="🔥 MARIO, ENTRA TÚ" customerName={ESCALATION_TRIGGER_LABELS[a.trigger]} detail={a.payload.recommendedNextStep} href={`/customers/${o.customer.id}?tab=resumen`}>
          <AlertActions alertId={a.id} status={a.status} />
        </AlertCard>
      ))}
      {o.conflicts.length > 0 && (
        <Link href={`/customers/${o.customer.id}?tab=datos&s=conflicts`} className="block rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="text-base font-semibold text-amber-300">⚠️ {o.conflicts.length} conflicto(s) de información</div>
          <div className="text-sm text-zinc-300">{o.conflicts.map((c) => c.label).join(", ")}</div>
        </Link>
      )}
      <SectionCard title="Siguiente paso">
        <p className="text-base text-zinc-100">{o.summary?.nextAction?.description ?? "Sin próximo paso registrado."}</p>
        {o.summary?.pendingItems.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
            {o.summary.pendingItems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        {o.crm.reason && <p className="mt-2 text-xs text-zinc-500">Último cambio de etapa: {o.crm.reason}</p>}
      </SectionCard>
      <SectionCard title="Perfil" action={<Link href={`/customers/${o.customer.id}?tab=datos`} className="text-sm text-emerald-400">Editar</Link>}>
        <KeyValue
          items={[
            { k: "Nombre", v: o.fullName },
            { k: "Celular", v: o.phone ?? "—" },
            { k: "Modelo de interés", v: o.vehicle ?? "—" },
            ...o.sectionCompleteness.map((sec) => ({
              k: sec.label,
              v: (
                <span>
                  {sec.confirmed}/{sec.total} confirmados {sec.conflicts > 0 && <Pill tone="red">⚠️ {sec.conflicts}</Pill>}
                </span>
              ),
            })),
          ]}
        />
      </SectionCard>
      {latestQuote && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Última cotización</h2>
          <QuoteCard q={latestQuote} />
        </div>
      )}
      {o.applications.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Crédito</h2>
          {o.applications.slice(0, 2).map((a) => (
            <CreditApplicationCard key={a.id} a={a} customerId={o.customer.id} />
          ))}
        </div>
      )}
      {o.sales.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Venta</h2>
          {o.sales.slice(0, 1).map((s) => (
            <SaleCard key={s.id} s={s} />
          ))}
        </div>
      )}
      <MissingDataCard items={missingDocs} href={`/customers/${o.customer.id}?tab=documentos`} />
      {!o.sales.length && (approved || latestQuote) && (
        <CreateSaleButton customerId={o.customer.id} quoteId={latestQuote?.id ?? null} creditApplicationId={approved?.id ?? null} label="Convertir en venta" />
      )}
    </>
  );
}

function toEditable(o: O, keys: string[]): EditableField[] {
  return keys
    .map((k) => o.profile.fields[k])
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    .map((f) => ({
      key: f.key,
      label: f.label,
      kind: f.kind,
      inputMode: f.inputMode,
      enumOptions: f.enumOptions,
      value: f.state.value === null || f.state.value === undefined ? null : Array.isArray(f.state.value) ? f.state.value.join(", ") : f.state.value,
      status: f.state.status,
      sourceLabel: f.state.sourceLabel,
    }));
}

export function DataTab({ o, section }: { o: O; section: string }) {
  const sections = o.profile.sections;
  const active = section === "conflicts" && o.conflicts.length ? "conflicts" : (sections.find((s) => s.section === section)?.section ?? sections[0]!.section);
  const items = [
    ...(o.conflicts.length ? [{ key: "conflicts", label: `⚠️ Conflictos`, href: `/customers/${o.customer.id}?tab=datos&s=conflicts`, count: o.conflicts.length }] : []),
    ...sections.map((s) => ({
      key: s.section,
      label: PROFILE_SECTION_LABELS[s.section],
      href: `/customers/${o.customer.id}?tab=datos&s=${s.section}`,
      count: s.keys.filter((k) => o.profile.fields[k]?.state.status === "conflicting").length,
    })),
  ];
  const renderConflicts = (keys: string[]) =>
    o.conflicts
      .filter((c) => keys.includes(c.key))
      .map((c) => (
        <ConflictCard
          key={c.key}
          customerId={o.customer.id}
          fieldKey={c.key}
          label={c.label}
          candidates={c.state.candidates.map((x) => ({ factId: x.factId, display: String(x.value), sourceLabel: x.sourceLabel }))}
        />
      ));
  if (active === "conflicts") {
    return (
      <>
        <ChipNav items={items} active="conflicts" />
        {renderConflicts(o.conflicts.map((c) => c.key))}
      </>
    );
  }
  const sec = sections.find((s) => s.section === active)!;
  const observed = o.observed.filter((f) => sec.keys.includes(f.key));
  return (
    <>
      <ChipNav items={items} active={active} />
      {renderConflicts(sec.keys)}
      {observed.length > 0 && (
        <SectionCard title="Por confirmar" subtitle="Datos observados (conversación o archivo). No se usan en solicitudes hasta confirmarlos.">
          <ConfirmAllButton customerId={o.customer.id} factIds={observed.map((f) => f.state.factId!)} label={`Confirmar todos (${observed.length})`} />
          <ul className="mt-2 divide-y divide-zinc-800">
            {observed.map((f) => (
              <li key={f.key} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-zinc-500">
                    {f.label} · {f.state.sourceLabel ?? "sin fuente"}
                  </div>
                  <div className="break-all text-base text-zinc-100">{f.state.display}</div>
                </div>
                <ConfirmFactButton customerId={o.customer.id} factId={f.state.factId!} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      <SectionCard title={PROFILE_SECTION_LABELS[active as ProfileSection]}>
        <ProfileSectionForm key={active} customerId={o.customer.id} section={active as ProfileSection} fields={toEditable(o, sec.keys)} />
      </SectionCard>
    </>
  );
}

export function ConversationTab({ o }: { o: O }) {
  return (
    <>
      {o.messages.length === 0 ? (
        <EmptyState>Sin mensajes. Los mensajes de WhatsApp llegarán aquí en un sprint futuro.</EmptyState>
      ) : (
        <div className="space-y-2">
          {o.messages.map((m) =>
            m.sender === "system" ? (
              <p key={m.id} className="text-center text-xs text-zinc-500">
                {m.body}
              </p>
            ) : (
              <div key={m.id} className={`flex ${m.sender === "customer" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.sender === "customer" ? "bg-zinc-800 text-zinc-100" : m.sender === "mario" ? "bg-sky-900/60 text-sky-50" : "bg-emerald-900/50 text-emerald-50"}`}>
                  {m.sender !== "customer" && <div className="text-[10px] font-semibold uppercase text-zinc-400">{m.sender === "mario" ? "Mario" : "Sofía"}</div>}
                  <div className="whitespace-pre-wrap">{m.body}</div>
                  <div className="mt-0.5 text-right text-[10px] text-zinc-500">{fmtDate(m.createdAt, true)}</div>
                </div>
              </div>
            ),
          )}
        </div>
      )}
      <LinkButton href={`/simulator?c=${o.customer.id}`} variant="secondary" block>
        Abrir en el simulador
      </LinkButton>
    </>
  );
}

export function QuotesTab({ o }: { o: O }) {
  return (
    <>
      {o.quotes.length === 0 ? (
        <EmptyState>Sin cotizaciones guardadas.</EmptyState>
      ) : (
        o.quotes.map((q) => (
          <QuoteCard key={q.id} q={q} action={!q.expired ? <CreateSaleButton customerId={o.customer.id} quoteId={q.id} creditApplicationId={o.applications.find((a) => a.status === "approved")?.id ?? null} label="Crear venta con esta cotización" /> : null} />
        ))
      )}
      <SectionCard title="Recordar corrida validada" subtitle="Solo se recupera un escenario EXACTO (modelo, versión, enganche y plazo). Nunca se interpola.">
        <ScenarioLookupForm customerId={o.customer.id} vehicles={o.vehicles} />
      </SectionCard>
      <SectionCard title="Registrar corrida que ya validaste">
        <RegisterScenarioForm vehicles={o.vehicles} />
      </SectionCard>
    </>
  );
}

export function CreditTab({ o }: { o: O }) {
  return (
    <>
      {o.applications.map((a) => (
        <CreditApplicationCard key={a.id} a={a} customerId={o.customer.id} />
      ))}
      <LinkButton href={`/customers/${o.customer.id}/credit`} block>
        {o.applications.length ? "Ir a crédito" : "Nueva solicitud de crédito"}
      </LinkButton>
    </>
  );
}

export function DocumentsTab({ o }: { o: O }) {
  return (
    <SectionCard title="Expediente" subtitle="Solo estados. Los archivos se guardan en almacenamiento privado.">
      <DocumentChecklist customerId={o.customer.id} items={o.documents} />
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {Object.entries(DOCUMENT_STATUS_LABELS)
          .filter(([k]) => k !== "requested")
          .map(([k, v]) => (
            <Pill key={k}>{v}</Pill>
          ))}
      </div>
    </SectionCard>
  );
}

export function SalesTab({ o }: { o: O }) {
  const approved = o.applications.find((a) => a.status === "approved");
  return (
    <>
      {o.sales.length === 0 ? <EmptyState>Sin ventas.</EmptyState> : o.sales.map((s) => <SaleCard key={s.id} s={s} />)}
      <SectionCard title="Nueva venta" subtitle="Elige una cotización en la pestaña Cotizaciones para heredar vehículo, enganche y bono; o créala vacía.">
        <CreateSaleButton customerId={o.customer.id} creditApplicationId={approved?.id ?? null} label="Crear venta sin cotización" />
      </SectionCard>
    </>
  );
}

export function AppointmentsTab({ o }: { o: O }) {
  return (
    <>
      <SectionCard title="Citas">
        {o.appointments.length === 0 ? (
          <EmptyState>Sin citas.</EmptyState>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {o.appointments.map((a) => (
              <li key={a.id} className="py-2 text-sm">
                <div className="text-zinc-100">
                  {a.kind === "test_drive" ? "Prueba de manejo" : a.kind === "delivery" ? "Entrega" : "Visita"} · {a.scheduledAt ? fmtDate(a.scheduledAt, true) : (a.requestedWindow ?? "sin horario")}
                </div>
                <div className="text-zinc-500">
                  {a.status}
                  {a.notes ? ` · ${a.notes}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title="Seguimientos">
        {o.followups.length === 0 ? (
          <EmptyState>Sin seguimientos.</EmptyState>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {o.followups.map((f) => (
              <li key={f.id} className="py-2 text-sm">
                <div className="text-zinc-100">{f.reason}</div>
                <div className="text-zinc-500">
                  {f.status}
                  {f.dueAt ? ` · vence ${fmtDate(f.dueAt)}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

const EVENT_LABELS: Record<string, string> = {
  customer_created: "Cliente creado",
  profile_facts_recorded: "Datos registrados",
  fact_conflict_resolved: "Conflicto resuelto",
  fact_confirmed: "Dato confirmado",
  credit_application_created: "Solicitud creada",
  credit_application_status: "Estado de solicitud",
  credit_pdf_generated: "Borrador PDF generado",
  document_status: "Documento actualizado",
  sale_created: "Venta creada",
  sale_updated: "Venta actualizada",
  crm_manual_change: "Etapa cambiada por Mario",
};

export function HistoryTab({ o }: { o: O }) {
  const events = [
    ...o.crm.history.map((h) => ({
      id: `crm-${h.id}`,
      title: `${h.previousStage ? `${CRM_STAGE_LABELS[h.previousStage as CrmStage]} → ` : ""}${CRM_STAGE_LABELS[h.stage as CrmStage]} · ${TEMPERATURE_LABELS[h.temperature as Temperature]}`,
      detail: h.reason,
      at: h.createdAt,
      actor: h.changedBy,
    })),
    ...o.audit.map((a) => {
      const d = a.data as Record<string, unknown>;
      const detail =
        a.eventType === "fact_conflict_resolved"
          ? `${String(d.key)}: se usó ${String(d.chosenSource ?? "captura manual")}`
          : a.eventType === "profile_facts_recorded"
            ? `${FACT_SOURCE_LABELS[d.source as FactSourceType] ?? String(d.source)} · ${String(d.sourceLabel ?? "")} · ${(d.saved as string[] | undefined)?.length ?? 0} guardados${(d.conflicts as string[] | undefined)?.length ? `, ${(d.conflicts as string[]).length} conflictos` : ""}`
            : a.eventType === "credit_application_status"
              ? `${String(d.from)} → ${String(d.to)}`
              : a.eventType === "sale_updated"
                ? `Campos: ${(d.fields as string[] | undefined)?.join(", ")}`
                : null;
      return { id: a.id, title: EVENT_LABELS[a.eventType] ?? a.eventType, detail, at: a.createdAt, actor: a.actorType };
    }),
  ].sort((x, y) => y.at.getTime() - x.at.getTime());
  return (
    <SectionCard title="Historial">
      <StatusTimeline items={events.slice(0, 60)} />
    </SectionCard>
  );
}

export { fmtMoney };
