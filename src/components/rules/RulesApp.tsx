"use client";

import { useEffect, useState } from "react";
import { QUOTE_CALCULATION_LABELS, type InfoStatus, type QuoteCalculationType } from "@/domain/enums";
import { api, fmtDate, fmtMoney, type Serialized } from "@/lib/api";
import type { getCommercialOverview } from "@/server/services/commercial";
import type { QuoteComputation } from "@/server/commercial/quoting";
import { Badge, Button, DemoBadge, StatusBadge } from "../ui";

type Overview = Serialized<Awaited<ReturnType<typeof getCommercialOverview>>>;
type Meta = { storedStatus: InfoStatus; effectiveStatus: InfoStatus; expired: boolean; validFrom: string | null; validTo: string | null; source: string | null; isDemo: boolean; notes: string | null };

function MetaCells({ m }: { m: Meta }) {
  return (
    <>
      <td className="px-2 py-1">
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={m.effectiveStatus} />
          {m.effectiveStatus !== m.storedStatus && <Badge tone="gray" title="Estatus guardado">guardado: {m.storedStatus}</Badge>}
          <DemoBadge show={m.isDemo} />
        </div>
      </td>
      <td className="px-2 py-1 text-slate-500">
        {fmtDate(m.validFrom, false)} → {fmtDate(m.validTo, false)}
      </td>
      <td className="px-2 py-1 text-slate-500">{m.source ?? "—"}</td>
    </>
  );
}

export function RulesApp() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ model: "City", version: "Sport", downPayment: "80000", termMonths: "48", paymentMethod: "financing" });
  const [results, setResults] = useState<Array<{ input: typeof form; result: Serialized<QuoteComputation> }>>([]);

  useEffect(() => {
    api<Overview>("/api/commercial").then(setData).catch((e: Error) => setError(e.message));
  }, []);

  const versions = data?.vehicles.find((v) => v.model === form.model)?.versions ?? [];

  async function run(overrides: Partial<typeof form> = {}) {
    const input = { ...form, ...overrides };
    try {
      const result = await api<Serialized<QuoteComputation>>("/api/commercial/quote", {
        body: {
          model: input.model,
          version: input.version,
          downPayment: Number(input.downPayment),
          termMonths: input.termMonths ? Number(input.termMonths) : null,
          paymentMethod: input.paymentMethod,
        },
      });
      setResults((r) => [{ input, result }, ...r].slice(0, 12));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function bonusSweep() {
    for (const dp of ["80000", "100000", "150000", "200000"]) await run({ downPayment: dp });
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">
          Todos los datos comerciales cargados son <b>DEMO (ficticios)</b>: sirven para probar reglas, no representan precios, bonos ni tasas reales de Honda.
          {data && <span className="ml-1 text-violet-600">Fecha de evaluación de vigencias: {fmtDate(data.now)}.</span>}
        </div>
        {error && <p className="rounded bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}

        <section className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">Probar reglas: bono y cotización</h2>
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label className="flex flex-col text-xs text-slate-500">
              Modelo
              <select className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-900" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value, version: data?.vehicles.find((v) => v.model === e.target.value)?.versions[0]?.name ?? "" })}>
                {data?.vehicles.map((v) => (
                  <option key={v.id}>{v.model}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs text-slate-500">
              Versión
              <select className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-900" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })}>
                {versions.map((v) => (
                  <option key={v.id}>{v.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs text-slate-500">
              Enganche
              <input className="w-28 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900" value={form.downPayment} onChange={(e) => setForm({ ...form, downPayment: e.target.value.replace(/[^\d]/g, "") })} />
            </label>
            <label className="flex flex-col text-xs text-slate-500">
              Plazo (meses)
              <input className="w-20 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900" value={form.termMonths} onChange={(e) => setForm({ ...form, termMonths: e.target.value.replace(/[^\d]/g, "") })} />
            </label>
            <label className="flex flex-col text-xs text-slate-500">
              Pago
              <select className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-900" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                <option value="financing">Financiamiento</option>
                <option value="cash">Contado</option>
              </select>
            </label>
            <Button tone="primary" onClick={() => void run()}>
              Calcular
            </Button>
            <Button onClick={() => void bonusSweep()}>Barrido de enganche (80k→200k)</Button>
          </div>
          <table className="mt-4 w-full text-left text-xs">
            <thead className="text-slate-400">
              <tr>
                <th className="px-2 py-1">Entrada</th>
                <th className="px-2 py-1">Resultado</th>
                <th className="px-2 py-1">Bono</th>
                <th className="px-2 py-1">Mensualidad</th>
                <th className="px-2 py-1">Traza</th>
              </tr>
            </thead>
            <tbody>
              {results.map(({ input, result }, i) => (
                <tr key={i} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-1">
                    {input.model} {input.version} · enganche {fmtMoney(Number(input.downPayment))} · {input.termMonths || "—"} m · {input.paymentMethod === "cash" ? "contado" : "crédito"}
                  </td>
                  <td className="px-2 py-1">
                    {result.ok ? (
                      <Badge tone={result.quote.calculationType === "estimate" ? "amber" : "teal"}>{QUOTE_CALCULATION_LABELS[result.quote.calculationType as QuoteCalculationType]}</Badge>
                    ) : (
                      <Badge tone="red">{result.message}</Badge>
                    )}
                  </td>
                  <td className="px-2 py-1 font-medium">{result.ok ? fmtMoney(result.quote.bonus) : "—"}</td>
                  <td className="px-2 py-1">{result.ok ? fmtMoney(result.quote.monthlyPayment) : "—"}</td>
                  <td className="px-2 py-1 text-slate-500">
                    {result.ok && (
                      <details>
                        <summary className="cursor-pointer">ver</summary>
                        <ul className="list-disc pl-4">
                          {result.quote.trace.map((t, j) => (
                            <li key={j}>{t}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {data && (
          <>
            <Table title="Precios, bonos y promociones" head={["Tipo", "Título", "Monto", "Vehículo", "Estado", "Vigencia", "Fuente"]}>
              {data.offers.map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="px-2 py-1">{o.type}</td>
                  <td className="px-2 py-1">{o.title}</td>
                  <td className="px-2 py-1">{fmtMoney(o.amount)}</td>
                  <td className="px-2 py-1">
                    {o.vehicle} {o.version ?? ""}
                  </td>
                  <MetaCells m={o} />
                </tr>
              ))}
            </Table>
            <Table title="Reglas de promoción (solo aplican si están vigentes y confirmadas)" head={["Regla", "Condición", "Efecto", "Estado", "Vigencia", "Fuente"]}>
              {data.rules.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-2 py-1">{r.name}</td>
                  <td className="px-2 py-1 font-mono">{JSON.stringify(r.condition)}</td>
                  <td className="px-2 py-1 font-mono">{JSON.stringify(r.effect)}</td>
                  <MetaCells m={r} />
                </tr>
              ))}
            </Table>
            <Table title="Financiamiento" head={["Financiera", "Tasa", "Plazos", "Enganche mín.", "Estado", "Vigencia", "Fuente"]}>
              {data.financing.map((f) => (
                <tr key={f.id} className="border-t border-slate-100">
                  <td className="px-2 py-1">
                    {f.lender} — {f.product}
                  </td>
                  <td className="px-2 py-1">{(f.annualRate * 100).toFixed(2)}%</td>
                  <td className="px-2 py-1">{f.allowedTerms.join("/")}</td>
                  <td className="px-2 py-1">{(f.minDownPaymentPct * 100).toFixed(0)}%</td>
                  <MetaCells m={f} />
                </tr>
              ))}
            </Table>
            <Table title="Corridas validadas, seguros y conocimiento general" head={["Tipo", "Título", "Detalle", "Estado", "Vigencia", "Fuente"]}>
              {data.templates.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-2 py-1">corrida</td>
                  <td className="px-2 py-1">{t.name}</td>
                  <td className="px-2 py-1">{fmtMoney(t.monthlyPayment)}/mes</td>
                  <MetaCells m={t} />
                </tr>
              ))}
              {data.insurance.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-2 py-1">seguro</td>
                  <td className="px-2 py-1">
                    {i.insurer} — {i.coverage}
                  </td>
                  <td className="px-2 py-1">{i.pctOfVehiclePrice ? `${(i.pctOfVehiclePrice * 100).toFixed(1)}% del valor` : fmtMoney(i.annualPremium)}</td>
                  <MetaCells m={i} />
                </tr>
              ))}
              {data.knowledge.map((k) => (
                <tr key={k.id} className="border-t border-slate-100">
                  <td className="px-2 py-1">{k.category}</td>
                  <td className="px-2 py-1">{k.title}</td>
                  <td className="px-2 py-1 text-slate-600">{k.content}</td>
                  <MetaCells m={k} />
                </tr>
              ))}
            </Table>
          </>
        )}
      </div>
    </div>
  );
}

function Table({ title, head, children }: { title: string; head: string[]; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-2 font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-400">
            <tr>
              {head.map((h) => (
                <th key={h} className="px-2 py-1 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}
