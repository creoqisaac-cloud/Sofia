"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDate } from "@/lib/api";
import type { InfoStatus } from "@/domain/enums";
import { Badge, Button, DemoBadge, StatusBadge } from "../ui";
import type { State } from "./SimulatorApp";

const SAMPLE_MESSAGES = [
  "Hola, me interesa el City para la familia",
  "¿Cuánto cuesta? Somos 4 y manejo más en ciudad",
  "La Sport. Tengo 80 mil de enganche, ¿cuánto quedaría a 48 meses?",
  "¿Y si doy 150 mil de enganche me dan más bono?",
  "¿Qué garantía tiene?",
  "¿Qué papeles necesito para el crédito?",
  "¿Me haces un descuento extra?",
  "Me encanta, ¿cuándo firmo? Lo quiero ya",
];

export function ChatPanel({
  state,
  busy,
  pending,
  onSend,
  onControl,
}: {
  state: State;
  busy: boolean;
  pending: { sender: "customer" | "mario"; body: string } | null;
  onSend: (sender: "customer" | "mario", body: string) => Promise<void>;
  onControl: (mode: "sofia" | "mario") => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [as, setAs] = useState<"customer" | "mario">("customer");
  const endRef = useRef<HTMLDivElement>(null);
  const marioMode = state.conversation.controlMode === "mario";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [state.messages.length, pending]);

  async function submit() {
    const body = text.trim();
    if (!body || busy) return;
    setText("");
    await onSend(as, body);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <div>
          <div className="font-medium">{state.customer.displayName}</div>
          <div className="text-xs text-slate-500">
            Canal: simulador · {state.messages.length} mensajes guardados
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {marioMode ? <Badge tone="blue">Mario al mando · Sofía en pausa</Badge> : <Badge tone="green">Sofía atendiendo</Badge>}
          {marioMode ? (
            <Button small onClick={() => onControl("sofia")} disabled={busy}>
              Devolver a Sofía
            </Button>
          ) : (
            <Button small onClick={() => onControl("mario")} disabled={busy}>
              Mario toma la conversación
            </Button>
          )}
        </div>
      </div>

      <div className="chat-bg min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {state.messages.length === 0 && !pending && (
          <p className="mt-10 text-center text-sm text-slate-500">Escribe como si fueras el cliente para iniciar la conversación.</p>
        )}
        <div className="mx-auto max-w-3xl space-y-2">
          {state.messages.map((m) => (
            <Bubble
              key={m.id}
              sender={m.sender}
              body={m.body}
              at={m.createdAt}
              flagged={Array.isArray(m.metadata?.guard) && (m.metadata.guard as string[]).length > 0}
              status={m.metadata?.status as string | undefined}
              sources={state.turns[m.id]?.knowledgeUsed}
            />
          ))}
          {pending && <Bubble sender={pending.sender} body={pending.body} at={null} />}
          {busy && pending?.sender === "customer" && !marioMode && (
            <div className="flex justify-end">
              <span className="rounded-lg bg-white/70 px-3 py-1 text-xs text-slate-500">Sofía está escribiendo…</span>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap gap-1">
          {SAMPLE_MESSAGES.map((s) => (
            <button key={s} onClick={() => setText(s)} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200">
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <select value={as} onChange={(e) => setAs(e.target.value as "customer" | "mario")} className="rounded border border-slate-300 px-2 py-2 text-sm">
            <option value="customer">Enviar como cliente</option>
            <option value="mario">Enviar como Mario</option>
          </select>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={2}
            placeholder={as === "customer" ? "Mensaje del cliente…" : "Mensaje de Mario (toma el control de la conversación)…"}
            className="min-h-[44px] flex-1 resize-none rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <Button tone="primary" onClick={() => void submit()} disabled={busy || !text.trim()}>
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}

type Source = { refId: string; title: string; status: string; isDemo: boolean; sourceName: string | null };

function Bubble({ sender, body, at, flagged, status, sources }: { sender: string; body: string; at: string | null; flagged?: boolean; status?: string; sources?: Source[] }) {
  if (sender === "system") {
    return (
      <div className="flex justify-center">
        <span className="rounded bg-slate-700/80 px-2 py-0.5 text-[11px] text-white">{body}</span>
      </div>
    );
  }
  const mine = sender !== "customer";
  const color = sender === "mario" ? "bg-sky-100" : sender === "sofia" ? "bg-[#d9fdd3]" : "bg-white";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm shadow-sm ${color}`}>
        {sender !== "customer" && (
          <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {sender === "mario" ? "Mario" : "Sofía"}
            {status === "fallback" && <Badge tone="amber">respuesta segura</Badge>}
            {flagged && status !== "fallback" && <Badge tone="amber" title="Un guardrail corrigió esta respuesta">corregida</Badge>}
          </div>
        )}
        <div className="whitespace-pre-wrap">{body}</div>
        {sources && sources.length > 0 && (
          <details className="mt-1 text-[11px] text-slate-600">
            <summary className="cursor-pointer text-slate-500">Fuentes ({sources.length})</summary>
            <ul className="mt-1 space-y-0.5">
              {sources.map((src) => (
                <li key={src.refId} className="flex flex-wrap items-center gap-1">
                  <StatusBadge status={src.status as InfoStatus} />
                  <DemoBadge show={src.isDemo} />
                  <span>{src.title}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="mt-0.5 text-right text-[10px] text-slate-400">{at ? fmtDate(at) : "enviando…"}</div>
      </div>
    </div>
  );
}
