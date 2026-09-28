"use client";

import { useActionState, useState } from "react";
import { quoteAction, type ActionState } from "@/app/actions";
import { QuoteResult, type QuoteView } from "./QuoteResult";

const TERMS = [12, 24, 36, 48, 60, 72];

/** Cotizador rápido: modelo, versión, enganche, plazo → corrida con fuentes (o qué falta). */
export function QuoteForm({ models, defaults }: { models: Array<{ model: string; versions: string[] }>; defaults?: { model?: string; version?: string; downPayment?: string; termMonths?: string } }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(quoteAction, null);
  const [model, setModel] = useState(defaults?.model ?? models[0]?.model ?? "");
  const [version, setVersion] = useState(defaults?.version ?? models[0]?.versions[0] ?? "");
  const [down, setDown] = useState(defaults?.downPayment ?? "");
  const [term, setTerm] = useState(defaults?.termMonths ?? "48");
  const [showForm, setShowForm] = useState(true);
  const versions = models.find((m) => m.model === model)?.versions ?? [];
  const q = state?.ok ? (state.data as QuoteView) : null;

  const field = "mt-1 w-full rounded-xl bg-raise px-3 py-3 text-[17px] text-ivory focus:outline-none";
  return (
    <div className="space-y-4">
      {showForm || !q ? (
        <form action={(fd) => { setShowForm(false); action(fd); }} className="rounded-3xl bg-panel p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[13px] text-dim">
              Modelo
              <select name="model" value={model} onChange={(e) => { setModel(e.target.value); setVersion(models.find((m) => m.model === e.target.value)?.versions[0] ?? ""); }} className={field}>
                {models.map((m) => (
                  <option key={m.model}>{m.model}</option>
                ))}
              </select>
            </label>
            <label className="text-[13px] text-dim">
              Versión
              <select name="version" value={version} onChange={(e) => setVersion(e.target.value)} className={field}>
                {versions.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-[13px] text-dim">
              Enganche
              <input name="downPayment" value={down} onChange={(e) => setDown(e.target.value)} inputMode="decimal" placeholder="150,000" required className={`${field} tabular`} />
            </label>
            <label className="text-[13px] text-dim">
              Plazo
              <select name="termMonths" value={term} onChange={(e) => setTerm(e.target.value)} className={field}>
                {TERMS.map((t) => (
                  <option key={t} value={t}>
                    {t} meses
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" disabled={pending} className="mt-4 min-h-12 w-full rounded-2xl bg-sand text-[16px] font-semibold text-ink">
            {pending ? "Calculando…" : "Cotizar"}
          </button>
          {state && !state.ok && <p className="mt-3 text-[15px] text-alert">{state.error}</p>}
        </form>
      ) : (
        <button type="button" onClick={() => setShowForm(true)} className="text-[14px] text-dim">
          ← Cambiar datos
        </button>
      )}
      {q && !pending && <QuoteResult q={q} onNew={() => setShowForm(true)} />}
    </div>
  );
}
