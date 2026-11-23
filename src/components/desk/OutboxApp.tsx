"use client";

import Link from "next/link";
import { useState } from "react";
import { api, type Serialized } from "@/lib/api";
import type { OutboxItem, PreviewItem } from "@/server/desk/outbox";
import { DirectiveBox } from "./DirectiveBox";
import { ErrorNote, fmtWhen, MediaThumb, relTime, SendBar } from "./ui";

type Item = Serialized<OutboxItem>;
type Suggestion = Serialized<PreviewItem> & { include: boolean };

const KIND_LABEL: Record<string, string> = { directive: "Indicación", followup: "Seguimiento", appointment: "Cita", reply: "Respuesta", media: "Material" };

export function OutboxApp({ initial, dayLabel, dayFocus, initialDirective = "" }: { initial: Item[]; dayLabel: string; dayFocus: string; initialDirective?: string }) {
  const [items, setItems] = useState(initial);
  const [suggest, setSuggest] = useState<{ kind: "followup" | "appointment"; items: Suggestion[]; restDay?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => setItems((await api<{ items: Item[] }>("/api/desk/outbox")).items);
  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function loadSuggestions(kind: "followup" | "appointment") {
    const r = await run(() =>
      kind === "followup"
        ? api<{ items: Serialized<PreviewItem>[]; restDay: boolean }>("/api/desk/outbox", { body: { action: "suggest_followups" } })
        : api<{ items: Serialized<PreviewItem>[] }>("/api/desk/outbox", { body: { action: "suggest_appointments" } }),
    );
    if (r) setSuggest({ kind, items: r.items.map((i) => ({ ...i, include: true })), restDay: (r as { restDay?: boolean }).restDay ?? false });
  }

  async function queueSuggestions() {
    if (!suggest) return;
    const chosen = suggest.items.filter((i) => i.include);
    if (!chosen.length) return;
    await run(() => api("/api/desk/outbox", { body: { action: "queue", kind: suggest.kind, items: chosen.map((i) => ({ customerId: i.customerId, body: i.body, mediaIds: i.mediaIds })) } }));
    setSuggest(null);
    await reload();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-panel p-4">
        <div className="text-[12px] font-semibold tracking-[0.18em] text-dim">HOY · {dayLabel.toUpperCase()}</div>
        <p className="mt-1 text-[15px] text-ivory">{dayFocus}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={() => loadSuggestions("followup")} className="min-h-12 rounded-2xl bg-raise px-3 text-[14px] text-ivory">
            Seguimientos que tocan hoy
          </button>
          <button type="button" disabled={busy} onClick={() => loadSuggestions("appointment")} className="min-h-12 rounded-2xl bg-raise px-3 text-[14px] text-ivory">
            Confirmar citas (hoy y mañana)
          </button>
        </div>
        {suggest && (
          <div className="mt-3 space-y-2">
            {suggest.restDay && <p className="text-[13px] text-dim">Hoy es domingo y tu estilo dice que no se mandan seguimientos. Cámbialo en Estilo si quieres.</p>}
            {!suggest.items.length && !suggest.restDay && <p className="text-[13px] text-dim">{suggest.kind === "followup" ? "Nadie necesita seguimiento hoy según tu cadencia." : "No hay citas por confirmar."}</p>}
            {suggest.items.map((it, idx) => (
              <div key={it.customerId} className={`rounded-2xl p-3 ${it.include ? "bg-raise" : "bg-raise/40 opacity-60"}`}>
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={it.include} onChange={(e) => setSuggest({ ...suggest, items: suggest.items.map((x, i) => (i === idx ? { ...x, include: e.target.checked } : x)) })} className="h-5 w-5 accent-[#e7d3ae]" />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ivory">{it.name}</span>
                  {it.model && <span className="text-[12px] text-sand">{it.model}</span>}
                </label>
                {it.include && (
                  <textarea
                    value={it.body}
                    onChange={(e) => setSuggest({ ...suggest, items: suggest.items.map((x, i) => (i === idx ? { ...x, body: e.target.value } : x)) })}
                    rows={4}
                    className="mt-2 w-full rounded-xl bg-ink/40 px-3 py-2 text-[14px] leading-relaxed text-ivory"
                  />
                )}
              </div>
            ))}
            {suggest.items.length > 0 && (
              <button type="button" disabled={busy} onClick={queueSuggestions} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-sand text-[15px] font-semibold text-ink">
                Poner {suggest.items.filter((i) => i.include).length} en la cola
              </button>
            )}
          </div>
        )}
      </section>

      <DirectiveBox initial={initialDirective} onQueued={() => void reload()} />

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="sofia-title text-[12px] font-semibold text-dim">POR ENVIAR</h2>
          <span className="text-[13px] text-faint">{items.length}</span>
        </div>
        <ErrorNote error={error} />
        {items.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-faint">No hay mensajes en la cola.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {items.map((it) => (
              <OutboxCard key={it.id} it={it} onDone={reload} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OutboxCard({ it, onDone }: { it: Item; onDone: () => Promise<void> }) {
  const [body, setBody] = useState(it.body);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: "sent" | "skipped") => {
    try {
      await api("/api/desk/outbox", { body: action === "sent" ? { action, id: it.id, body } : { action, id: it.id } });
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <li className="rounded-3xl bg-panel p-4">
      <div className="flex items-center gap-2">
        <Link href={`/ventas/chat/${it.customerId}`} className="min-w-0 flex-1 truncate text-[16px] font-semibold text-ivory">
          {it.name}
        </Link>
        <span className="rounded-full bg-raise px-2 py-0.5 text-[11px] text-dim">{KIND_LABEL[it.kind] ?? it.kind}</span>
      </div>
      <div className="mt-0.5 text-[12px] text-faint">
        {it.dueAt ? `Para ${fmtWhen(it.dueAt)}` : relTime(it.createdAt)}
        {it.reason ? ` · ${it.reason}` : ""}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={Math.min(8, Math.max(3, body.split("\n").length + 1))} className="mt-2 w-full rounded-xl bg-raise px-3 py-2 text-[15px] leading-relaxed text-ivory" />
      {it.media.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {it.media.map((m) => (
            <MediaThumb key={m.id} m={m} size="sm" />
          ))}
        </div>
      )}
      <ErrorNote error={error} />
      <SendBar phone={it.phone} text={body} media={it.media} onSent={() => act("sent")} onSkip={() => act("skipped")} />
    </li>
  );
}
