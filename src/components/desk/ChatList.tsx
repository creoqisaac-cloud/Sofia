"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, type Serialized } from "@/lib/api";
import type { ChatListItem } from "@/server/desk/chats";
import { Chip, ErrorNote, relTime, TEMP_DOT } from "./ui";

type Chat = Serialized<ChatListItem>;
type Filter = "todos" | "contestar" | "pendientes";

export function ChatList({ initial }: { initial: Chat[] }) {
  const [chats, setChats] = useState(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>(initial.some((c) => c.needsReply) ? "contestar" : "todos");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      api<{ chats: Chat[] }>("/api/desk/chats").then((r) => setChats(r.chats)).catch((e: Error) => setError(e.message));
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => ({ contestar: chats.filter((c) => c.needsReply).length, pendientes: chats.filter((c) => c.replyPending || c.pendingOutbox).length }), [chats]);
  const shown = chats
    .filter((c) => (filter === "contestar" ? c.needsReply : filter === "pendientes" ? c.replyPending || c.pendingOutbox > 0 : true))
    .filter((c) => {
      const n = q.trim().toLowerCase();
      return !n || c.name.toLowerCase().includes(n) || (c.phone ?? "").includes(n) || c.models.some((m) => m.toLowerCase().includes(n));
    });

  return (
    <section>
      <div className="flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Buscar cliente, teléfono o modelo" className="min-h-11 min-w-0 flex-1 rounded-xl bg-panel px-4 text-[16px] text-ivory placeholder:text-faint" />
        <Link href="/ventas/nuevo" className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-sand px-4 text-[15px] font-semibold text-ink">
          + Chat
        </Link>
      </div>
      <div className="mt-3 flex gap-1.5">
        {(
          [
            ["contestar", `Por contestar${counts.contestar ? ` · ${counts.contestar}` : ""}`],
            ["pendientes", `Sin enviar${counts.pendientes ? ` · ${counts.pendientes}` : ""}`],
            ["todos", "Todos"],
          ] as Array<[Filter, string]>
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`min-h-9 rounded-full px-3.5 text-[13px] ${filter === k ? "bg-ivory text-ink" : "bg-panel text-dim"}`}>
            {label}
          </button>
        ))}
      </div>
      <ErrorNote error={error} />
      {shown.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-faint">{filter === "contestar" ? "Nadie esperando respuesta. 🙌" : "No hay chats aquí."}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl bg-panel">
          {shown.map((c) => (
            <li key={c.customerId}>
              <Link href={`/ventas/chat/${c.customerId}`} className="flex min-h-[4.25rem] items-center gap-3 px-4 py-3 active:bg-raise">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TEMP_DOT[c.temperature] ?? "bg-zinc-500"}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`truncate text-[15px] ${c.needsReply ? "font-semibold text-ivory" : "text-ivory"}`}>{c.name}</span>
                    {c.models.slice(0, 1).map((m) => (
                      <Chip key={m} tone="model">
                        {m}
                      </Chip>
                    ))}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-faint">
                    {c.last ? `${c.last.sender === "customer" ? "" : c.last.sender === "mario" ? "Tú: " : "Sofía: "}${c.last.body}` : "Sin mensajes"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] text-faint">{relTime(c.at)}</span>
                  {c.needsReply ? (
                    <span className="rounded-full bg-alert px-2 text-[11px] font-semibold text-ink">contestar</span>
                  ) : c.replyPending ? (
                    <span className="rounded-full bg-sand/20 px-2 text-[11px] text-sand">sin enviar</span>
                  ) : c.pendingOutbox ? (
                    <span className="rounded-full bg-raise px-2 text-[11px] text-dim">{c.pendingOutbox} en cola</span>
                  ) : c.controlMode === "mario" ? (
                    <span className="text-[11px] text-faint">tú contestas</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
