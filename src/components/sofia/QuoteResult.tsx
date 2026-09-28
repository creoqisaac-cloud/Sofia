"use client";

import Link from "next/link";
import { useState } from "react";

/** Forma serializada (JSON) de QuoteRunView. */
export interface QuoteView {
  runId: string;
  vehicleLabel: string;
  downPayment: number;
  termMonths: number;
  result: {
    exactness: "exact" | "unvalidated" | "incomplete";
    components: Array<{ key: string; label: string; amount: number | null; source: string | null; kind: string }>;
    monthlyPayment: number | null;
    missing: string[];
    isDemo: boolean;
    headline: string;
  };
  program: { name: string; lender: string; status: string; validTo: string | Date | null } | null;
  validatedExample: { name: string; monthlyPayment: number; isDemo: boolean } | null;
}

const mxn = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }));

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Error");
  return j;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <span className="text-[15px] text-dim">{label}</span>
      <span className={`tabular ${strong ? "text-ivory" : "text-ivory/90"} text-[17px]`}>{value}</span>
    </div>
  );
}

export function QuoteResult({ q, customerId, onNew }: { q: QuoteView; customerId?: string | null; onNew?: () => void }) {
  const [showSources, setShowSources] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [assign, setAssign] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Array<{ id: string; title: string; kind: string }>>([]);
  const r = q.result;
  const c = (k: string) => r.components.find((x) => x.key === k);
  const complete = r.exactness !== "incomplete";

  const save = async (cid: string | null) => {
    setErr(null);
    try {
      const res = await post("/api/command/confirm", { action: { type: "save_quote", runId: q.runId, customerId: cid, label: q.vehicleLabel } });
      setMsg(res.message);
      setAssign(false);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const search = async (v: string) => {
    setQuery(v);
    if (v.trim().length < 2) return setHits([]);
    const r2 = await fetch(`/api/search?q=${encodeURIComponent(v)}`).then((x) => x.json());
    setHits((r2.hits ?? []).filter((h: { kind: string }) => h.kind === "customer"));
  };
  const share = async () => {
    const lines = [
      `${q.vehicleLabel}`,
      `Precio: ${mxn(c("vehicle_price")?.amount)}`,
      c("bonus")?.amount ? `Bono: ${mxn(c("bonus")?.amount)}` : null,
      `Enganche: ${mxn(q.downPayment)}`,
      `Plazo: ${q.termMonths} meses`,
      complete ? `Mensualidad: ${mxn(r.monthlyPayment)}` : null,
      complete && c("insurance")?.amount ? `Seguro: ${mxn(c("insurance")?.amount)}` : null,
      complete && c("opening_commission")?.amount ? `Comisión por apertura: ${mxn(c("opening_commission")?.amount)}` : null,
      r.isDemo ? "(Cifras DEMO, no reales)" : null,
      "Sujeto a aprobación de crédito.",
    ].filter(Boolean);
    const text = lines.join("\n");
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setMsg("Copiado");
      }
    } catch {
      /* cancelado */
    }
  };


  return (
    <div className="rounded-3xl bg-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-2xl font-semibold tracking-tight text-ivory">{q.vehicleLabel}</h3>
        {r.isDemo && <span className="mt-1 rounded-full bg-raise px-2 py-0.5 text-[11px] text-sand">DEMO</span>}
      </div>

      {complete ? (
        <div className="mt-4">
          <div className="text-[13px] text-dim">Mensualidad · {q.termMonths} meses</div>
          <div className="tabular text-[40px] font-semibold leading-tight tracking-tight text-sand">{mxn(r.monthlyPayment)}</div>
          <div className={`mt-1 text-[13px] ${r.exactness === "exact" ? "text-good" : "text-alert"}`}>{r.headline}</div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-raise p-4">
          <div className="text-[15px] font-medium text-alert">{r.headline}</div>
          <ul className="mt-2 space-y-1 text-[15px] text-ivory/90">
            {r.missing.map((m) => (
              <li key={m}>· {m}</li>
            ))}
          </ul>
          {q.validatedExample && (
            <div className="mt-3 text-[14px] text-good">
              Sí hay una corrida validada guardada para este escenario: {mxn(q.validatedExample.monthlyPayment)} al mes ({q.validatedExample.name}).
            </div>
          )}
        </div>
      )}

      <div className="mt-4 divide-y divide-line">
        <Row label="Precio" value={mxn(c("vehicle_price")?.amount)} />
        <Row label="Bono" value={c("bonus")?.amount ? mxn(c("bonus")?.amount) : "Sin bono vigente"} />
        <Row label="Enganche" value={mxn(q.downPayment)} />
        {complete && <Row label="Monto financiado" value={mxn(c("amount_financed")?.amount)} />}
        {complete && <Row label="Seguro" value={c("insurance")?.amount === null ? "No incluido" : mxn(c("insurance")?.amount)} />}
        {complete && <Row label="Comisión por apertura" value={mxn(c("opening_commission")?.amount)} />}
        {complete && <Row label="Pago inicial" value={mxn(c("initial_payment")?.amount)} strong />}
      </div>

      <button type="button" onClick={() => setShowSources((v) => !v)} className="mt-2 text-[13px] text-faint underline-offset-4 hover:underline">
        {showSources ? "Ocultar fuentes" : "Fuentes y vigencia"}
      </button>
      {showSources && (
        <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-faint">
          {r.components
            .filter((x) => x.source && x.kind !== "missing")
            .map((x) => (
              <li key={x.key}>
                <span className="text-dim">{x.label}:</span> {x.source}
              </li>
            ))}
          {q.program && (
            <li>
              <span className="text-dim">Programa:</span> {q.program.lender} · {q.program.name} · {q.program.status}
              {q.program.validTo ? ` · vigente al ${new Date(q.program.validTo).toLocaleDateString("es-MX")}` : ""}
            </li>
          )}
        </ul>
      )}

      {msg && <p className="mt-3 text-[14px] text-good">{msg}</p>}
      {err && <p className="mt-3 text-[14px] text-alert">{err}</p>}

      {assign && (
        <div className="mt-3">
          <input value={query} onChange={(e) => search(e.target.value)} placeholder="Buscar cliente" autoFocus className="w-full rounded-xl bg-raise px-4 py-3 text-ivory placeholder:text-faint focus:outline-none" />
          <ul className="mt-1">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => save(h.id)} className="flex min-h-11 w-full items-center px-2 text-left text-ivory">
                  {h.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {complete && (
          <>
            <button type="button" onClick={() => (customerId ? save(customerId) : save(null))} className="min-h-12 rounded-2xl bg-sand text-[15px] font-semibold text-ink">
              {customerId ? "Guardar en cliente" : "Guardar corrida"}
            </button>
            <button type="button" onClick={() => setAssign((v) => !v)} className="min-h-12 rounded-2xl bg-raise text-[15px] text-ivory">
              Asignar cliente
            </button>
            <button type="button" onClick={share} className="min-h-12 rounded-2xl bg-raise text-[15px] text-ivory">
              Compartir
            </button>
          </>
        )}
        {onNew ? (
          <button type="button" onClick={onNew} className="min-h-12 rounded-2xl bg-raise text-[15px] text-ivory">
            Nueva cotización
          </button>
        ) : (
          <Link href="/quote" className="flex min-h-12 items-center justify-center rounded-2xl bg-raise text-[15px] text-ivory">
            Nueva cotización
          </Link>
        )}
      </div>
    </div>
  );
}
