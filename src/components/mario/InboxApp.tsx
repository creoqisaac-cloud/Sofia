"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CRM_STAGE_LABELS, TEMPERATURE_LABELS, type CrmStage, type Temperature } from "@/domain/enums";
import { api, fmtDate, fmtMoney, type Serialized } from "@/lib/api";
import type { getInbox } from "@/server/services/mario";
import { Badge, Button, Empty } from "../ui";

type Inbox = Serialized<Awaited<ReturnType<typeof getInbox>>>;

export function InboxApp() {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(() => api<Inbox>("/api/mario/inbox").then(setInbox).catch((e: Error) => setError(e.message)), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-6">
      {error && <p className="mb-3 rounded bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-semibold">🔥 Alertas para Mario</h2>
          {!inbox?.alerts.length && <Empty>No hay alertas abiertas.</Empty>}
          <div className="space-y-3">
            {inbox?.alerts.map((a) => (
              <article key={a.id} className="rounded-lg border border-rose-200 bg-white p-4 shadow-sm">
                <header className="flex items-center gap-2">
                  <span className="font-bold text-rose-700">{a.title}</span>
                  <Badge tone={a.status === "open" ? "red" : "gray"}>{a.status === "open" ? "abierta" : "vista"}</Badge>
                  <span className="ml-auto text-xs text-slate-400">{fmtDate(a.createdAt)}</span>
                </header>
                <p className="mt-1 text-sm font-medium">{a.triggerLabel}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <dt className="text-slate-400">Cliente</dt>
                  <dd>{a.payload.customer}</dd>
                  <dt className="text-slate-400">Vehículo</dt>
                  <dd>{[a.payload.vehicle, a.payload.version].filter(Boolean).join(" ") || "—"}</dd>
                  <dt className="text-slate-400">Enganche</dt>
                  <dd>{fmtMoney(a.payload.downPayment)}</dd>
                  <dt className="text-slate-400">Mensualidad objetivo</dt>
                  <dd>{fmtMoney(a.payload.monthlyTarget)}</dd>
                  <dt className="text-slate-400">Tiempo de compra</dt>
                  <dd>{a.payload.purchaseTiming ?? "—"}</dd>
                  <dt className="text-slate-400">Etapa / temperatura</dt>
                  <dd>
                    {CRM_STAGE_LABELS[a.payload.crmStage as CrmStage]} · {TEMPERATURE_LABELS[a.payload.temperature as Temperature]}
                  </dd>
                  <dt className="text-slate-400">Cotización</dt>
                  <dd>{a.payload.quoteStatus}</dd>
                  <dt className="text-slate-400">Crédito</dt>
                  <dd>{a.payload.creditStatus}</dd>
                  <dt className="text-slate-400">Objeción principal</dt>
                  <dd>{a.payload.mainObjection ?? "—"}</dd>
                </dl>
                <p className="mt-2 text-sm">
                  <b>Motivo:</b> {a.payload.reasonForEscalation}
                </p>
                <p className="text-sm">
                  <b>Siguiente paso recomendado:</b> {a.payload.recommendedNextStep}
                </p>
                <p className="mt-1 text-xs text-slate-600">{a.payload.shortSummary}</p>
                <footer className="mt-3 flex gap-2">
                  <Link href={`/simulator?c=${a.customerId}`} className="rounded bg-slate-800 px-3 py-1 text-sm text-white">
                    Abrir conversación
                  </Link>
                  {a.status === "open" && (
                    <Button small onClick={() => act(() => api(`/api/alerts/${a.id}`, { body: { status: "acknowledged" } }))}>
                      Marcar vista
                    </Button>
                  )}
                  <Button small onClick={() => act(() => api(`/api/alerts/${a.id}`, { body: { status: "resolved" } }))}>
                    Resolver
                  </Button>
                </footer>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Aprobaciones pendientes</h2>
          {!inbox?.approvals.length && <Empty>No hay solicitudes pendientes.</Empty>}
          <div className="space-y-3">
            {inbox?.approvals.map((a) => (
              <article key={a.id} className="rounded-lg border border-orange-200 bg-white p-4 shadow-sm">
                <header className="flex items-center gap-2">
                  <Badge tone="orange">{a.actionLabel}</Badge>
                  <span className="text-sm font-medium">{a.customerName}</span>
                  <span className="ml-auto text-xs text-slate-400">{fmtDate(a.createdAt)}</span>
                </header>
                <p className="mt-2 text-sm">{a.reason}</p>
                {Object.values(a.payload).some((v) => v !== null && v !== undefined) && (
                  <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-[11px] text-slate-600">{JSON.stringify(a.payload, null, 2)}</pre>
                )}
                <input
                  className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  placeholder="Nota de Mario (opcional)"
                  value={notes[a.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
                />
                <footer className="mt-2 flex gap-2">
                  <Button small tone="primary" onClick={() => act(() => api(`/api/approvals/${a.id}`, { body: { decision: "approved", notes: notes[a.id] ?? null } }))}>
                    Aprobar
                  </Button>
                  <Button small tone="danger" onClick={() => act(() => api(`/api/approvals/${a.id}`, { body: { decision: "rejected", notes: notes[a.id] ?? null } }))}>
                    Rechazar
                  </Button>
                  <Link href={`/simulator?c=${a.customerId}`} className="ml-auto text-sm text-slate-600 underline">
                    Ver conversación
                  </Link>
                </footer>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
