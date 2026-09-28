"use client";

import { useState } from "react";
import {
  CRM_STAGE_LABELS,
  ESCALATION_TRIGGER_LABELS,
  NEXT_ACTION_LABELS,
  QUOTE_CALCULATION_LABELS,
  TEMPERATURE_LABELS,
  APPROVAL_ACTION_LABELS,
  DOCUMENT_TYPE_LABELS,
  type ApprovalActionType,
  type CrmStage,
  type DocumentType,
  type EscalationTrigger,
  type InfoStatus,
  type NextActionType,
  type QuoteCalculationType,
  type Temperature,
} from "@/domain/enums";
import { api, fmtDate, fmtMoney } from "@/lib/api";
import { Badge, Button, DemoBadge, Empty, Section, StatusBadge, TEMPERATURE_TONE, type Tone } from "../ui";
import type { State } from "./SimulatorApp";

interface KnowledgeRef {
  refType: string;
  refId: string;
  title: string;
  status: InfoStatus;
  statusPresented: InfoStatus;
  sourceName: string | null;
  isDemo: boolean;
  corrected: boolean;
}
interface GuardViolation {
  code: string;
  detail: string;
  action: "fixed" | "blocked";
}

const QUOTE_TONE: Record<QuoteCalculationType, Tone> = { official: "dark", validated_template: "teal", estimate: "amber" };

export function InsightPanel({ state, onChanged, onError }: { state: State; onChanged: () => Promise<void>; onError: (e: string) => void }) {
  const run = state.lastRun;
  const knowledge = (run?.knowledgeUsed ?? []) as unknown as KnowledgeRef[];
  const guard = (run?.guard ?? {}) as { violations?: GuardViolation[]; attempts?: number; blocked?: boolean };
  const openAlerts = state.alerts.filter((a) => a.status === "open" || a.status === "acknowledged");
  const pendingApprovals = state.approvals.filter((a) => a.status === "pending");
  const quote = state.quotes.find((q) => q.status === "presented") ?? state.quotes[0];
  const nextAction = (state.summary?.nextAction ?? run?.nextAction) as { type: NextActionType; description: string } | null;
  const escalation = run?.escalationReason as { trigger: EscalationTrigger; explanation: string } | null;

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <aside className="w-[400px] shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50">
      {/* CRM */}
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="dark">{CRM_STAGE_LABELS[state.crm.stage as CrmStage]}</Badge>
          <Badge tone={TEMPERATURE_TONE[state.crm.temperature as Temperature]}>🌡 {TEMPERATURE_LABELS[state.crm.temperature as Temperature]}</Badge>
          {run?.requiresMario && <Badge tone="red">Intervención de Mario recomendada</Badge>}
          {run?.requiresApproval && <Badge tone="orange">Requiere aprobación</Badge>}
        </div>
        {state.crm.reason && <p className="mt-2 text-xs text-slate-500">Último cambio: {state.crm.reason}</p>}
      </div>

      {/* Alerta a Mario */}
      {openAlerts.map((a) => {
        const p = a.payload;
        return (
          <div key={a.id} className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-bold text-rose-700">{a.title}</span>
              <Badge tone={a.status === "open" ? "red" : "gray"}>{a.status === "open" ? "abierta" : "vista"}</Badge>
            </div>
            <p className="mt-1 text-xs font-medium text-rose-800">{ESCALATION_TRIGGER_LABELS[a.trigger as EscalationTrigger]}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <Field k="Cliente" v={p.customer} />
              <Field k="Vehículo" v={[p.vehicle, p.version].filter(Boolean).join(" ") || "—"} />
              <Field k="Enganche" v={fmtMoney(p.downPayment)} />
              <Field k="Mensualidad objetivo" v={fmtMoney(p.monthlyTarget)} />
              <Field k="Tiempo de compra" v={p.purchaseTiming ?? "—"} />
              <Field k="Etapa / temp." v={`${CRM_STAGE_LABELS[p.crmStage as CrmStage] ?? p.crmStage} · ${TEMPERATURE_LABELS[p.temperature as Temperature] ?? p.temperature}`} />
              <Field k="Cotización" v={p.quoteStatus} />
              <Field k="Crédito" v={p.creditStatus} />
              <Field k="Objeción principal" v={p.mainObjection ?? "—"} />
            </dl>
            <p className="mt-2 text-xs"><b>Motivo:</b> {p.reasonForEscalation}</p>
            <p className="text-xs"><b>Siguiente paso:</b> {p.recommendedNextStep}</p>
            <p className="mt-1 text-xs text-slate-600"><b>Resumen:</b> {p.shortSummary}</p>
            <div className="mt-2 flex gap-2">
              {a.status === "open" && (
                <Button small onClick={() => act(() => api(`/api/alerts/${a.id}`, { body: { status: "acknowledged" } }))}>
                  Marcar vista
                </Button>
              )}
              <Button small onClick={() => act(() => api(`/api/alerts/${a.id}`, { body: { status: "resolved" } }))}>
                Resolver
              </Button>
            </div>
          </div>
        );
      })}

      <Section title="Próximo paso">
        {nextAction ? (
          <p>
            <Badge tone="blue">{NEXT_ACTION_LABELS[nextAction.type] ?? nextAction.type}</Badge> <span className="text-slate-700">{nextAction.description}</span>
          </p>
        ) : (
          <Empty>Sin próximo paso todavía.</Empty>
        )}
        {escalation && (
          <p className="mt-2 text-xs text-rose-700">
            Escalamiento: {ESCALATION_TRIGGER_LABELS[escalation.trigger]} — {escalation.explanation}
          </p>
        )}
      </Section>

      {pendingApprovals.length > 0 && (
        <Section title="Aprobaciones pendientes" right={<Badge tone="orange">{pendingApprovals.length}</Badge>}>
          {pendingApprovals.map((a) => (
            <ApprovalRow key={a.id} id={a.id} label={APPROVAL_ACTION_LABELS[a.actionType as ApprovalActionType]} reason={a.reason} act={act} />
          ))}
        </Section>
      )}

      <Section title="Cotización" right={quote ? <Badge tone={QUOTE_TONE[quote.calculationType as QuoteCalculationType]}>{QUOTE_CALCULATION_LABELS[quote.calculationType as QuoteCalculationType]}</Badge> : null}>
        {quote ? (
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium">{quote.vehicle}</span>
              <DemoBadge show={quote.isDemo} />
              <Badge>{quote.status}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <Field k="Precio" v={fmtMoney(quote.vehiclePrice)} />
              <Field k="Bono" v={fmtMoney(quote.bonus)} />
              <Field k="Enganche" v={fmtMoney(quote.downPayment)} />
              <Field k="Plazo" v={quote.termMonths ? `${quote.termMonths} meses` : "—"} />
              <Field k="Mensualidad" v={fmtMoney(quote.monthlyPayment)} />
              <Field k="Tasa anual" v={quote.annualRate !== null ? `${(quote.annualRate * 100).toFixed(2)}%` : "—"} />
              <Field k="Comisión apertura" v={fmtMoney(quote.openingCommission)} />
              <Field k="Seguro (anual)" v={fmtMoney(quote.insurance)} />
            </dl>
            <p className="text-slate-500">{quote.conditions}</p>
            <details>
              <summary className="cursor-pointer text-slate-500">Traza de cálculo</summary>
              <ul className="mt-1 list-disc pl-4 text-slate-500">
                {quote.trace.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </details>
          </div>
        ) : (
          <Empty>Sin cotización todavía.</Empty>
        )}
      </Section>

      <Section title="Fuentes usadas por Sofía" right={<span className="text-xs text-slate-400">{knowledge.length}</span>}>
        {knowledge.length ? (
          <ul className="space-y-1.5">
            {knowledge.map((k) => (
              <li key={k.refId} className="text-xs">
                <div className="flex flex-wrap items-center gap-1">
                  <StatusBadge status={k.status} />
                  <DemoBadge show={k.isDemo} />
                  {k.corrected && <Badge tone="red" title={`El modelo lo presentó como ${k.statusPresented}`}>estado corregido</Badge>}
                  <span className="font-medium text-slate-700">{k.title}</span>
                </div>
                <div className="text-slate-400">{k.sourceName ?? "sin fuente"}</div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>La última respuesta no usó información comercial.</Empty>
        )}
      </Section>

      <Section title="Guardrails del último turno" right={guard.violations?.length ? <Badge tone={guard.blocked ? "red" : "amber"}>{guard.violations.length}</Badge> : <Badge tone="green">ok</Badge>}>
        {guard.violations?.length ? (
          <ul className="space-y-1 text-xs">
            {guard.violations.map((v, i) => (
              <li key={i}>
                <Badge tone={v.action === "blocked" ? "red" : "amber"}>{v.action === "blocked" ? "bloqueado" : "corregido"}</Badge> <b>{v.code}</b>: {v.detail}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Sin incidencias.</Empty>
        )}
        {run && (
          <p className="mt-2 text-[11px] text-slate-400">
            {run.provider} · {run.model ?? "—"} · {run.latencyMs ?? "?"} ms · intentos: {guard.attempts ?? 1} · estado: {run.status}
          </p>
        )}
      </Section>

      <Section title="Etiquetas">
        {state.tags.length ? (
          <div className="flex flex-wrap gap-1">
            {state.tags.map((t) => (
              <Badge key={t.tag} tone={t.source === "system" ? "violet" : "gray"} title={t.reason ?? undefined}>
                {t.label}
              </Badge>
            ))}
          </div>
        ) : (
          <Empty>Sin etiquetas.</Empty>
        )}
      </Section>

      <Section title="Datos conocidos" right={<span className="text-xs text-slate-400">perfil v{state.profile.version}</span>}>
        {state.profile.knownFacts.length ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            {state.profile.knownFacts.map((f) => (
              <Field key={f.key} k={f.label} v={f.value} />
            ))}
          </dl>
        ) : (
          <Empty>Sofía aún no conoce datos del cliente.</Empty>
        )}
      </Section>

      <Section title="Datos útiles faltantes">
        {state.profile.missingFacts.length ? (
          <div className="flex flex-wrap gap-1">
            {state.profile.missingFacts.map((m, i) => (
              <Badge key={m.key} tone={i === 0 ? "blue" : "gray"}>
                {i === 0 ? "→ " : ""}
                {m.label}
              </Badge>
            ))}
          </div>
        ) : (
          <Empty>Perfil completo para avanzar.</Empty>
        )}
      </Section>

      <Section title="Resumen acumulado" right={<span className="text-xs text-slate-400">v{state.summary?.version ?? 0}</span>}>
        {state.summary?.text ? <p className="text-xs leading-relaxed text-slate-700">{state.summary.text}</p> : <Empty>Sin resumen todavía.</Empty>}
        <CommitmentBox customerId={state.customer.id} commitments={state.summary?.commitments ?? []} act={act} />
        <p className="mt-2 text-[11px] font-semibold uppercase text-slate-400">Pendientes</p>
        {state.summary?.pendingItems.length ? (
          <ul className="list-disc pl-4 text-xs text-slate-600">
            {state.summary.pendingItems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        ) : (
          <Empty>Sin pendientes.</Empty>
        )}
      </Section>

      <Section title="Memoria enviada al modelo" defaultOpen={false}>
        {run ? (
          <div className="text-xs text-slate-600">
            <p>
              Mensajes recientes incluidos: <b>{run.contextStats.recent_messages ?? "—"}</b> de <b>{run.contextStats.total_messages ?? "—"}</b> guardados.
            </p>
            <p>Datos comerciales recuperados: {run.contextStats.knowledge_items ?? 0}</p>
            <p>
              Capas estables: {run.contextStats.system_chars ?? 0} caracteres · capas dinámicas: {run.contextStats.user_chars ?? 0} caracteres
            </p>
            <p className="mt-1 text-slate-400">El historial completo queda en la base de datos para auditoría; al modelo solo va perfil + CRM + resumen + compromisos + pendientes + últimos mensajes + conocimiento recuperado.</p>
          </div>
        ) : (
          <Empty>Aún no hay turnos.</Empty>
        )}
      </Section>

      <Section title="Citas, seguimientos y documentos" defaultOpen={false}>
        {state.appointments.map((a) => (
          <p key={a.id} className="text-xs">
            <Badge tone="blue">{a.kind === "test_drive" ? "Prueba de manejo" : "Visita"}</Badge> {a.requestedWindow ?? "sin horario"} · <i>{a.status}</i>
          </p>
        ))}
        {state.followups.map((f) => (
          <p key={f.id} className="text-xs">
            <Badge>Seguimiento</Badge> {f.reason}
          </p>
        ))}
        {state.documents.map((d) => (
          <p key={d.id} className="text-xs">
            <Badge tone="violet">{DOCUMENT_TYPE_LABELS[d.docType as DocumentType]}</Badge> {d.status}
          </p>
        ))}
        {state.appointments.length + state.followups.length + state.documents.length === 0 && <Empty>Nada registrado.</Empty>}
      </Section>

      <Section title="Historial CRM" defaultOpen={false}>
        <ul className="space-y-1 text-xs">
          {state.crm.history.map((h) => (
            <li key={h.id}>
              <span className="text-slate-400">{fmtDate(h.createdAt)}</span> ·{" "}
              {h.previousStage ? `${CRM_STAGE_LABELS[h.previousStage as CrmStage]} → ` : ""}
              <b>{CRM_STAGE_LABELS[h.stage as CrmStage]}</b>, {TEMPERATURE_LABELS[h.temperature as Temperature]} <Badge>{h.changedBy}</Badge>
              <div className="text-slate-500">{h.reason}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Bitácora de hechos" defaultOpen={false}>
        <ul className="space-y-1 text-xs">
          {state.profile.factHistory.map((f) => (
            <li key={f.id} className={!["observed","confirmed"].includes(f.status) ? "text-slate-400 line-through" : ""}>
              <b>{f.label}</b>: {f.value} <Badge tone={["observed","confirmed"].includes(f.status) ? "green" : "gray"}>{f.status}</Badge>
              {f.evidence && <span className="text-slate-400"> · “{f.evidence}”</span>}
            </li>
          ))}
        </ul>
      </Section>
    </aside>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-slate-800">{v}</dd>
    </>
  );
}

function ApprovalRow({ id, label, reason, act }: { id: string; label: string; reason: string; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [notes, setNotes] = useState("");
  return (
    <div className="mb-2 rounded border border-orange-200 bg-orange-50 p-2 text-xs">
      <p className="font-medium">{label}</p>
      <p className="text-slate-600">{reason}</p>
      <input className="mt-1 w-full rounded border border-slate-300 px-2 py-0.5" placeholder="Nota de Mario (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="mt-1 flex gap-2">
        <Button small tone="primary" onClick={() => act(() => api(`/api/approvals/${id}`, { body: { decision: "approved", notes } }))}>
          Aprobar
        </Button>
        <Button small tone="danger" onClick={() => act(() => api(`/api/approvals/${id}`, { body: { decision: "rejected", notes } }))}>
          Rechazar
        </Button>
      </div>
    </div>
  );
}

function CommitmentBox({
  customerId,
  commitments,
  act,
}: {
  customerId: string;
  commitments: Array<{ text: string; source: string; status: string }>;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [text, setText] = useState("");
  return (
    <div className="mt-2">
      <p className="text-[11px] font-semibold uppercase text-slate-400">Compromisos de Mario</p>
      {commitments.length ? (
        <ul className="list-disc pl-4 text-xs text-slate-600">
          {commitments.map((c, i) => (
            <li key={i}>
              {c.text} <span className="text-slate-400">({c.source === "mario_manual" ? "manual" : "de su mensaje"})</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Sin compromisos registrados.</Empty>
      )}
      <form
        className="mt-1 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          void act(() => api(`/api/customers/${customerId}/commitments`, { body: { text } })).then(() => setText(""));
        }}
      >
        <input className="flex-1 rounded border border-slate-300 px-2 py-0.5 text-xs" placeholder="Agregar compromiso de Mario…" value={text} onChange={(e) => setText(e.target.value)} />
        <Button small type="submit">
          +
        </Button>
      </form>
    </div>
  );
}
