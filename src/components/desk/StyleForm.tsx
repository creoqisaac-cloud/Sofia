"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { composeMessage, dayPlaybook, type SalesStyle } from "@/domain/sales-style";
import { ErrorNote } from "./ui";

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function StyleForm({ initial }: { initial: SalesStyle }) {
  const [st, setSt] = useState<SalesStyle>(initial);
  const [days, setDays] = useState(initial.followupDays.join(", "));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof SalesStyle>(k: K, v: SalesStyle[K]) => {
    setSt((x) => ({ ...x, [k]: v }));
    setSaved(false);
  };

  const now = useMemo(() => new Date(), []);
  const play = dayPlaybook(now, st);
  const sample = composeMessage({ kind: "followup", style: st, now, firstName: "Juan", model: "HR-V", attempt: 1 });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const followupDays = days.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
      const r = await api<SalesStyle>("/api/desk/style", { method: "PUT", body: { ...st, followupDays } });
      setSt(r);
      setDays(r.followupDays.join(", "));
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-xl bg-raise px-4 py-3 text-[16px] text-ivory placeholder:text-faint";
  const seg = (active: boolean) => `min-h-10 flex-1 rounded-full px-3 text-[13px] ${active ? "bg-ivory font-semibold text-ink" : "bg-raise text-dim"}`;

  return (
    <form onSubmit={save} className="space-y-4">
      <section className="rounded-3xl bg-panel p-4">
        <div className="text-[12px] font-semibold tracking-[0.18em] text-dim">HOY · {play.label.toUpperCase()}</div>
        <p className="mt-1 text-[15px] text-ivory">{play.focus}</p>
        <div className="mt-3 rounded-2xl bg-[#2a2419] px-4 py-3">
          <div className="mb-1 text-[11px] text-faint">Así escribe Sofía un seguimiento hoy</div>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ivory">{sample}</p>
        </div>
      </section>

      <section className="grid gap-3 rounded-3xl bg-panel p-4 sm:grid-cols-3">
        <label className="block text-[13px] text-dim">
          Nombre de la asistente
          <input value={st.assistantName} onChange={(e) => set("assistantName", e.target.value)} className={input} />
        </label>
        <label className="block text-[13px] text-dim">
          Asesor
          <input value={st.advisorName} onChange={(e) => set("advisorName", e.target.value)} className={input} />
        </label>
        <label className="block text-[13px] text-dim">
          Agencia
          <input value={st.agency} onChange={(e) => set("agency", e.target.value)} className={input} />
        </label>
      </section>

      <section className="space-y-4 rounded-3xl bg-panel p-4">
        <div>
          <div className="text-[13px] text-dim">Tono de seguimientos e indicaciones</div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => set("tone", "cercano")} className={seg(st.tone === "cercano")}>
              Cercano (tú)
            </button>
            <button type="button" onClick={() => set("tone", "formal")} className={seg(st.tone === "formal")}>
              Formal (usted)
            </button>
          </div>
        </div>
        <div>
          <div className="text-[13px] text-dim">Emojis</div>
          <div className="mt-2 flex gap-2">
            {([0, 1, 2] as const).map((n) => (
              <button key={n} type="button" onClick={() => set("emojis", n)} className={seg(st.emojis === n)}>
                {n === 0 ? "Ninguno" : n === 1 ? "Uno" : "Hasta dos"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[13px] text-dim">Urgencia (cierre de mes, fin de semana)</div>
          <div className="mt-2 flex gap-2">
            {(["suave", "normal", "alta"] as const).map((u) => (
              <button key={u} type="button" onClick={() => set("urgency", u)} className={seg(st.urgency === u)}>
                {u[0]!.toUpperCase() + u.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-[13px] text-dim">
          Firma (opcional)
          <input value={st.signature} onChange={(e) => set("signature", e.target.value)} maxLength={120} placeholder="Ej.: Mario Abarca · Honda Valle Oriente · 81 1234 5678" className={input} />
        </label>
      </section>

      <section className="space-y-3 rounded-3xl bg-panel p-4">
        <label className="block text-[13px] text-dim">
          Seguimiento: días sin respuesta para cada intento
          <input value={days} onChange={(e) => (setDays(e.target.value), setSaved(false))} placeholder="1, 3, 7, 15, 30" className={input} />
        </label>
        <label className="flex items-center gap-3 text-[14px] text-ivory">
          <input type="checkbox" checked={st.restOnSunday} onChange={(e) => set("restOnSunday", e.target.checked)} className="h-5 w-5 accent-[#e7d3ae]" />
          No mandar seguimientos en domingo
        </label>
        <label className="block text-[13px] text-dim">
          Enganche sano (abajo de esto Sofía recomienda otro modelo): {Math.round(st.healthyDownPct * 100)}%
          <input type="range" min={5} max={40} step={1} value={Math.round(st.healthyDownPct * 100)} onChange={(e) => set("healthyDownPct", Number(e.target.value) / 100)} className="mt-2 w-full accent-[#e7d3ae]" />
        </label>
      </section>

      <section className="rounded-3xl bg-panel p-4">
        <div className="text-[15px] font-semibold text-ivory">Tu frase de cierre por día</div>
        <p className="mt-0.5 text-[13px] text-dim">Déjala vacía para usar la de Sofía.</p>
        <div className="mt-3 space-y-2">
          {DAYS.map((d, i) => {
            const k = String(i) as keyof SalesStyle["dayPhrases"];
            const def = dayPlaybook(new Date(Date.UTC(2026, 10, 22 + i, 18)), { ...st, dayPhrases: {} }).cta[st.tone === "formal" ? "usted" : "tu"];
            return (
              <label key={d} className="block text-[12px] text-faint">
                {d}
                <input
                  value={st.dayPhrases[k] ?? ""}
                  onChange={(e) => set("dayPhrases", { ...st.dayPhrases, [k]: e.target.value })}
                  placeholder={def}
                  className="mt-1 w-full rounded-xl bg-raise px-3 py-2.5 text-[15px] text-ivory placeholder:text-faint"
                />
              </label>
            );
          })}
        </div>
      </section>

      <ErrorNote error={error} />
      <button type="submit" disabled={busy} className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-sand text-[16px] font-semibold text-ink shadow-lg disabled:opacity-50 lg:bottom-4">
        {busy ? "Guardando…" : saved ? "✓ Guardado" : "Guardar estilo"}
      </button>
    </form>
  );
}
