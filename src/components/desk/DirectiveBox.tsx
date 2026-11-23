"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Serialized } from "@/lib/api";
import type { previewDirective } from "@/server/desk/outbox";
import { ErrorNote, MediaThumb, SendBar } from "./ui";

type Preview = Serialized<Awaited<ReturnType<typeof previewDirective>>>;
type Item = Preview["items"][number] & { include: boolean };

const EXAMPLES = [
  "Háblale a los calientes del HR-V con la promo de este mes",
  "Manda el flyer del Civic a todos los tibios",
  "Dile a Juan Pérez que ya llegó su unidad y que lo esperamos el sábado",
  "A los que no contestan del CR-V mándales fotos y video",
  "Confírmales la cita a los citados de mañana",
];

/**
 * Indicaciones directas a Sofía. Sofía entiende a quién y qué decir (sin IA), redacta cada
 * mensaje con el estilo de Mario y lo deja listo en Envíos. `customerId` = solo ese cliente.
 */
export function DirectiveBox({ initial = "", customerId, phone, onQueued, compact = false }: { initial?: string; customerId?: string; phone?: string | null; onQueued?: () => void; compact?: boolean }) {
  const [text, setText] = useState(initial);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ queued: number; ids: Array<{ id: string; customerId: string }> } | null>(null);

  useEffect(() => {
    if (initial) void run(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  async function run(t = text) {
    if (!t.trim()) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const p = customerId
        ? await api<Preview>(`/api/desk/chats/${customerId}`, { body: { action: "directive_preview", text: t } })
        : await api<Preview>("/api/desk/directives", { body: { action: "preview", text: t } });
      setPreview(p);
      setItems(p.items.map((i) => ({ ...i, include: true })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return null;
    const chosen = items.filter((i) => i.include && i.body.trim());
    if (!chosen.length) {
      setError("Elige al menos un cliente.");
      return null;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ queued: number; ids: Array<{ id: string; customerId: string }> }>("/api/desk/directives", {
        body: { action: "commit", text, plan: preview.plan as unknown as Record<string, unknown>, dueAt: preview.plan.dueAt, items: chosen.map((i) => ({ customerId: i.customerId, body: i.body, mediaIds: i.mediaIds, kind: i.kind })) },
      });
      setDone(r);
      onQueued?.();
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const included = items.filter((i) => i.include).length;
  const single = customerId && items.length === 1 ? items[0]! : null;

  return (
    <section id="indicar" className={compact ? "" : "rounded-3xl bg-panel p-4"}>
      {!compact && (
        <>
          <h2 className="text-[17px] font-semibold text-ivory">Pídele a Sofía</h2>
          <p className="mt-0.5 text-[13px] text-dim">Escríbele como a tu asistente: a quién, qué decir y qué mandar. Revisas antes de enviar.</p>
        </>
      )}
      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={compact ? 2 : 3}
          maxLength={1500}
          placeholder={customerId ? "Ej.: mándale fotos y video del HR-V y dile que hay bono este mes" : "Ej.: Háblale a los calientes del HR-V con la promo de este mes"}
          className="w-full rounded-2xl bg-raise px-4 py-3 text-[16px] leading-snug text-ivory placeholder:text-faint"
        />
        {!compact && !preview && (
          <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setText(ex)} className="shrink-0 rounded-full bg-raise px-3 py-1.5 text-[12px] text-dim hover:text-ivory">
                {ex}
              </button>
            ))}
          </div>
        )}
        <button type="submit" disabled={busy || !text.trim()} className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-sand text-[15px] font-semibold text-ink disabled:opacity-50">
          {busy && !preview ? "Pensando…" : customerId ? "Redactar mensaje" : "Ver a quién y qué les digo"}
        </button>
      </form>

      <div className="mt-3 space-y-3">
        <ErrorNote error={error} />
        {preview && (
          <>
            <ul className="space-y-1 rounded-2xl bg-raise/60 px-4 py-3 text-[13px] text-dim">
              {preview.plan.understood.map((u) => (
                <li key={u}>• {u}</li>
              ))}
              {preview.warnings.map((w) => (
                <li key={w} className="text-alert">
                  ⚠ {w}
                </li>
              ))}
            </ul>

            {single ? (
              <div className="rounded-2xl bg-raise p-3">
                <textarea value={single.body} onChange={(e) => setItems([{ ...single, body: e.target.value }])} rows={6} className="w-full rounded-xl bg-ink/40 px-3 py-2 text-[15px] leading-relaxed text-ivory" />
                <SingleSend
                  ids={single.mediaIds}
                  phone={phone ?? single.phone}
                  text={single.body}
                  onSent={async () => {
                    const r = await commit();
                    const id = r?.ids[0]?.id;
                    if (id) await api("/api/desk/outbox", { body: { action: "sent", id, body: single.body } });
                    onQueued?.();
                  }}
                />
                <button type="button" disabled={busy} onClick={() => void commit()} className="mt-2 text-[13px] text-dim underline-offset-2 hover:text-ivory hover:underline">
                  Mejor déjalo en Envíos para después
                </button>
              </div>
            ) : (
              items.length > 0 && (
                <>
                  <div className="flex items-center justify-between text-[13px] text-dim">
                    <span>
                      {included} de {items.length} cliente{items.length === 1 ? "" : "s"}
                    </span>
                    <button type="button" className="text-sand" onClick={() => setItems(items.map((i) => ({ ...i, include: included !== items.length })))}>
                      {included === items.length ? "Quitar todos" : "Elegir todos"}
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {items.map((it, idx) => (
                      <li key={it.customerId} className={`rounded-2xl p-3 ${it.include ? "bg-raise" : "bg-raise/40 opacity-60"}`}>
                        <label className="flex items-center gap-3">
                          <input type="checkbox" checked={it.include} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, include: e.target.checked } : x)))} className="h-5 w-5 accent-[#e7d3ae]" />
                          <span className="min-w-0 flex-1 truncate text-[15px] text-ivory">{it.name}</span>
                          {it.model && <span className="text-[12px] text-sand">{it.model}</span>}
                          {!it.phone && <span className="text-[11px] text-alert">sin tel.</span>}
                        </label>
                        {it.include && (
                          <>
                            <textarea value={it.body} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, body: e.target.value } : x)))} rows={4} className="mt-2 w-full rounded-xl bg-ink/40 px-3 py-2 text-[14px] leading-relaxed text-ivory" />
                            {it.mediaIds.length > 0 && <MediaRow ids={it.mediaIds} />}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button type="button" disabled={busy || !included} onClick={() => void commit()} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-sand text-[15px] font-semibold text-ink disabled:opacity-50">
                    Poner {included} mensaje{included === 1 ? "" : "s"} en Envíos
                  </button>
                </>
              )
            )}
            {done && (
              <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-[14px] text-emerald-300">
                ✓ {done.queued} mensaje{done.queued === 1 ? "" : "s"} listo{done.queued === 1 ? "" : "s"}.{" "}
                <Link href="/ventas/envios" className="underline">
                  Ir a Envíos
                </Link>
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function useMedia(ids: string[]) {
  const [media, setMedia] = useState<Array<{ id: string; title: string; mimeType: string; kind: string }>>([]);
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    api<{ media: Array<{ id: string; title: string; mimeType: string; kind: string }> }>("/api/desk/media")
      .then((r) => alive && setMedia(r.media.filter((m) => key.split(",").includes(m.id))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key]);
  return media;
}

function MediaRow({ ids }: { ids: string[] }) {
  const media = useMedia(ids);
  if (!media.length) return null;
  return (
    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
      {media.map((m) => (
        <MediaThumb key={m.id} m={m} size="sm" />
      ))}
    </div>
  );
}

/** Un solo cliente: miniaturas + WhatsApp con los archivos + registrar como enviado. */
function SingleSend({ ids, phone, text, onSent }: { ids: string[]; phone: string | null; text: string; onSent: () => Promise<void> }) {
  const media = useMedia(ids);
  return (
    <>
      {media.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {media.map((m) => (
            <MediaThumb key={m.id} m={m} size="sm" />
          ))}
        </div>
      )}
      <SendBar phone={phone} text={text} media={media} onSent={onSent} sentLabel="Registrar como enviado" />
    </>
  );
}
