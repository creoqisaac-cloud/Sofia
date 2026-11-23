"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtMoney, type Serialized } from "@/lib/api";
import type { ChatView } from "@/server/desk/chats";
import { DirectiveBox } from "./DirectiveBox";
import { Chip, ErrorNote, fmtWhen, MediaThumb, SendBar, TEMP_DOT, TEMP_LABEL } from "./ui";

type View = Serialized<ChatView>;
type Mode = "customer" | "mario" | "sofia";

const MODES: Array<{ key: Mode; label: string; hint: string }> = [
  { key: "customer", label: "El cliente dice", hint: "Pega aquí lo que te escribió (uno o varios mensajes)" },
  { key: "mario", label: "Yo contesté", hint: "Lo que tú le mandaste, para que Sofía lo sepa" },
  { key: "sofia", label: "Pedirle a Sofía", hint: "Ej.: mándale fotos del HR-V y dile que hay bono" },
];

export function ChatRoom({ customerId, initial }: { customerId: string; initial: View }) {
  const [view, setView] = useState<View>(initial);
  const [mode, setMode] = useState<Mode>("customer");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setView(await api<View>(`/api/desk/chats/${customerId}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [customerId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [view.messages.length]);

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/desk/chats", { body: { customerId, text, as: mode === "mario" ? "mario" : "auto" } });
      setText("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/desk/chats/${customerId}`, { body });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const lastSofia = [...view.messages].reverse().find((m) => m.sender === "sofia");
  const lastCustomerIdx = view.messages.map((m) => m.sender).lastIndexOf("customer");
  const h = view.highlights;
  const facts = [
    h.model && `${h.model}${h.version ? ` ${h.version}` : ""}`,
    h.downPayment !== null && `Enganche ${fmtMoney(h.downPayment)}`,
    h.monthly !== null && `Mensualidad ${fmtMoney(h.monthly)}`,
    h.payment === "cash" ? "Contado" : h.payment === "financing" ? "Crédito" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex min-h-[calc(100dvh-5rem)] flex-col">
      {/* Encabezado */}
      <header className="sticky top-0 z-30 bg-ink/92 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Link href="/ventas" aria-label="Regresar" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-3xl font-light text-dim hover:text-ivory">
            ‹
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 truncate text-[19px] font-semibold text-ivory">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TEMP_DOT[view.crm.temperature] ?? ""}`} title={TEMP_LABEL[view.crm.temperature]} />
              <span className="truncate">{view.customer.name}</span>
            </h1>
            <div className="truncate text-[13px] text-dim">{view.customer.phone ?? "Sin teléfono"}</div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => action({ action: "control", conversationId: view.conversation.id, mode: view.conversation.controlMode === "sofia" ? "mario" : "sofia" })}
            className={`min-h-9 shrink-0 rounded-full px-3 text-[12px] ${view.conversation.controlMode === "sofia" ? "bg-sand/15 text-sand" : "bg-raise text-dim"}`}
            title="Quién contesta este chat"
          >
            {view.conversation.controlMode === "sofia" ? "Sofía contesta" : "Tú contestas"}
          </button>
          <Link href={`/customers/${customerId}`} className="min-h-9 shrink-0 rounded-full bg-raise px-3 py-2 text-[12px] text-dim">
            Ficha
          </Link>
        </div>
        {(facts.length > 0 || view.tags.length > 0 || view.appointments.length > 0) && (
          <div className="mx-auto mt-2 flex max-w-3xl gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {facts.map((f) => (
              <Chip key={f}>{f}</Chip>
            ))}
            {view.appointments.map((a) => (
              <Chip key={a.id} tone="sand">
                📅 {a.at ? fmtWhen(a.at) : (a.window ?? "por confirmar")}
              </Chip>
            ))}
            {view.tags
              .filter((t) => !t.model)
              .slice(0, 4)
              .map((t) => (
                <Chip key={t.tag}>{t.label}</Chip>
              ))}
          </div>
        )}
      </header>

      {/* Conversación */}
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-2 px-3 py-3">
        {view.messages.length === 0 && <p className="py-10 text-center text-[14px] text-faint">Pega abajo lo que te escribió el cliente y Sofía le contesta.</p>}
        {view.messages.map((m, idx) => {
          if (m.sender === "system") {
            return (
              <p key={m.id} className="py-1 text-center text-[11px] text-faint">
                {m.body}
              </p>
            );
          }
          const mine = m.sender !== "customer";
          const isLastSofia = m.id === lastSofia?.id && idx > lastCustomerIdx - 1;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${m.sender === "customer" ? "rounded-bl-md bg-panel" : m.sender === "mario" ? "rounded-br-md bg-emerald-900/40" : "rounded-br-md bg-[#2a2419]"}`}>
                <div className="mb-0.5 text-[11px] text-faint">
                  {m.sender === "customer" ? view.customer.name.split(" ")[0] : m.sender === "mario" ? "Tú" : "Sofía"} · {fmtWhen(m.at)}
                  {m.sender === "sofia" && m.delivered && " · enviado ✓"}
                </div>
                {m.understood && (
                  <div className="mb-1 text-[11px] text-sand/80">
                    {m.understood.burst > 1 && `Entendí ${m.understood.burst} mensajes juntos`}
                    {m.understood.burst > 1 && m.understood.fixes.length > 0 && " · "}
                    {m.understood.fixes.length > 0 && `corregí: ${m.understood.fixes.slice(0, 4).map((f) => `${f.from}→${f.to}`).join(", ")}`}
                  </div>
                )}
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ivory">{m.body}</p>
                {m.media.length > 0 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {m.media.map((x) => (
                      <MediaThumb key={x.id} m={x} />
                    ))}
                  </div>
                )}
                {m.sender === "sofia" && isLastSofia && !m.delivered && (
                  <>
                    <SendBar phone={view.customer.phone} text={m.body} media={m.media} onSent={() => action({ action: "delivered", messageId: m.id })} />
                    <button type="button" disabled={busy} onClick={() => action({ action: "regenerate" })} className="mt-1 text-[12px] text-faint hover:text-ivory">
                      ↻ Que Sofía lo intente otra vez
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Compositor */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-ink/95 px-3 pb-3 pt-2 backdrop-blur-xl lg:bottom-0">
        <div className="mx-auto max-w-3xl">
          <div className="flex gap-1.5">
            {MODES.map((x) => (
              <button key={x.key} type="button" onClick={() => setMode(x.key)} className={`min-h-9 flex-1 rounded-full px-2 text-[12px] ${mode === x.key ? "bg-ivory font-semibold text-ink" : "bg-panel text-dim"}`}>
                {x.label}
              </button>
            ))}
          </div>
          <ErrorNote error={error} />
          {mode === "sofia" ? (
            <div className="mt-2">
              <DirectiveBox key={customerId} customerId={customerId} phone={view.customer.phone} compact onQueued={load} />
            </div>
          ) : (
            <form
              className="mt-2 flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={text.split("\n").length > 2 ? 4 : 2}
                placeholder={MODES.find((x) => x.key === mode)!.hint}
                className="min-w-0 flex-1 rounded-2xl bg-panel px-4 py-3 text-[16px] leading-snug text-ivory placeholder:text-faint"
              />
              <button type="submit" disabled={busy || !text.trim()} className="inline-flex min-h-12 shrink-0 items-center rounded-2xl bg-sand px-4 text-[15px] font-semibold text-ink disabled:opacity-50">
                {busy ? "…" : mode === "customer" ? (view.conversation.controlMode === "sofia" ? "Responder" : "Guardar") : "Guardar"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
