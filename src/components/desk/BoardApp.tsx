"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api, type Serialized } from "@/lib/api";
import type { Board, BoardCard } from "@/server/desk/pipeline";
import { periodLabel } from "@/domain/sales-style";
import { Chip, COLOR_CLASS, ErrorNote, fmtWhen, relTime, TEMP_DOT, TEMP_LABEL } from "./ui";

type B = Serialized<Board>;
type Card = Serialized<BoardCard>;
type ViewMode = "columns" | "months";

const COLORS = ["red", "orange", "amber", "green", "blue", "violet", "gray"];
const TEMPS: Array<[string, string]> = [
  ["", "Sin temperatura"],
  ["very_hot", "Muy caliente"],
  ["hot", "Caliente"],
  ["interested", "Tibio"],
  ["cold", "Frío"],
];

export function BoardApp({ initial }: { initial: B }) {
  const [board, setBoard] = useState<B>(initial);
  const [mode, setMode] = useState<ViewMode>("columns");
  const [model, setModel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<Card | null>(null);
  const [editCol, setEditCol] = useState<B["columns"][number] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => setBoard(await api<B>("/api/desk/board"));
  async function post(body: Record<string, unknown>, optimistic?: (b: B) => B) {
    setError(null);
    if (optimistic) setBoard((b) => optimistic(b));
    try {
      await api("/api/desk/board", { body });
      await reload();
    } catch (e) {
      setError((e as Error).message);
      await reload().catch(() => undefined);
    }
  }

  const cards = useMemo(
    () =>
      board.cards.filter((c) => {
        if (model && !c.tags.some((t) => t.model && t.label === model)) return false;
        const n = q.trim().toLowerCase();
        return !n || c.name.toLowerCase().includes(n) || c.tags.some((t) => t.label.toLowerCase().includes(n));
      }),
    [board.cards, model, q],
  );

  const lanes =
    mode === "columns"
      ? board.columns.map((c) => ({ key: c.id, title: c.name, color: c.color, col: c, items: cards.filter((x) => x.columnId === c.id) }))
      : [...board.periods]
          .sort()
          .filter((p) => p >= board.currentPeriod || cards.some((c) => c.period === p))
          .map((p) => ({ key: p, title: periodLabel(p), color: p === board.currentPeriod ? "amber" : "gray", col: null, items: cards.filter((x) => x.period === p) }));

  function move(customerId: string, laneKey: string, beforeId: string | null) {
    const lane = lanes.find((l) => l.key === laneKey);
    if (!lane) return;
    const list = lane.items.filter((c) => c.customerId !== customerId);
    let position: number;
    if (beforeId) {
      const i = list.findIndex((c) => c.customerId === beforeId);
      const target = list[i]!;
      const prev = list[i - 1];
      position = prev ? (prev.position + target.position) / 2 : target.position - 1;
    } else position = (list.at(-1)?.position ?? 0) + 1;
    const patch = mode === "columns" ? { columnId: laneKey } : { period: laneKey };
    void post({ action: "move", customerId, position, ...patch }, (b) => ({
      ...b,
      cards: b.cards.map((c) => (c.customerId === customerId ? { ...c, ...patch, position, pinned: true } : c)).sort((a, z) => a.position - z.position),
    }));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-panel p-1">
          {(
            [
              ["columns", "Por columna"],
              ["months", "Por mes"],
            ] as Array<[ViewMode, string]>
          ).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`min-h-9 rounded-full px-4 text-[13px] ${mode === k ? "bg-ivory font-semibold text-ink" : "text-dim"}`}>
              {label}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Buscar" className="min-h-10 min-w-0 flex-1 rounded-full bg-panel px-4 text-[15px] text-ivory placeholder:text-faint" />
        {mode === "columns" && (
          <button type="button" onClick={() => setEditCol({ id: "", name: "", color: "gray", temperature: null })} className="min-h-10 rounded-full bg-raise px-4 text-[13px] text-ivory">
            + Columna
          </button>
        )}
      </div>
      {board.models.length > 0 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
          <button type="button" onClick={() => setModel(null)} className={`min-h-8 shrink-0 rounded-full px-3 text-[12px] ${!model ? "bg-sand text-ink" : "bg-panel text-dim"}`}>
            Todos los modelos
          </button>
          {board.models.map((m) => (
            <button key={m} type="button" onClick={() => setModel(model === m ? null : m)} className={`min-h-8 shrink-0 rounded-full px-3 text-[12px] ${model === m ? "bg-sand text-ink" : "bg-panel text-dim"}`}>
              {m}
            </button>
          ))}
        </div>
      )}
      <ErrorNote error={error} />

      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4">
        {lanes.map((lane) => {
          const c = COLOR_CLASS[lane.color] ?? COLOR_CLASS.gray!;
          return (
            <section
              key={lane.key}
              onDragOver={(e) => {
                e.preventDefault();
                setOverKey(lane.key);
              }}
              onDragLeave={() => setOverKey((k) => (k === lane.key ? null : k))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                setOverKey(null);
                if (id) move(id, lane.key, null);
              }}
              className={`flex w-[82vw] max-w-[19rem] shrink-0 snap-start flex-col rounded-3xl bg-panel p-2.5 ring-1 ring-inset ${overKey === lane.key ? c.ring : "ring-transparent"}`}
            >
              <header className="flex items-center gap-2 px-1.5 pb-2 pt-1">
                <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
                <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ivory">{lane.title}</h3>
                <span className="text-[12px] text-faint">{lane.items.length}</span>
                {lane.col && (
                  <button type="button" aria-label="Editar columna" onClick={() => setEditCol(lane.col)} className="h-8 w-8 rounded-full text-faint hover:bg-raise hover:text-ivory">
                    ⋯
                  </button>
                )}
              </header>
              <ul className="flex min-h-24 flex-col gap-2">
                {lane.items.map((card) => (
                  <li
                    key={card.customerId}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", card.customerId);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(card.customerId);
                    }}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const id = e.dataTransfer.getData("text/plain") || dragId;
                      setOverKey(null);
                      if (id && id !== card.customerId) move(id, lane.key, card.customerId);
                    }}
                    className={`rounded-2xl bg-raise p-3 ${dragId === card.customerId ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TEMP_DOT[card.temperature]}`} title={TEMP_LABEL[card.temperature]} />
                      <Link href={`/ventas/chat/${card.customerId}`} className="min-w-0 flex-1">
                        <div className="truncate text-[15px] text-ivory">{card.name}</div>
                        <div className="text-[11px] text-faint">
                          {card.lastAt ? relTime(card.lastAt) : "sin mensajes"}
                          {card.pinned ? " · acomodado por ti" : ""}
                        </div>
                      </Link>
                      <button type="button" aria-label="Opciones" onClick={() => setMenuFor(card)} className="-mr-1 h-9 w-9 shrink-0 rounded-full text-faint hover:bg-panel hover:text-ivory">
                        ⋯
                      </button>
                    </div>
                    {(card.tags.length > 0 || card.nextAppointment || card.pendingOutbox > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {card.nextAppointment && <Chip tone="sand">📅 {fmtWhen(card.nextAppointment.at)}</Chip>}
                        {card.pendingOutbox > 0 && <Chip>✉ {card.pendingOutbox} por enviar</Chip>}
                        {card.tags.slice(0, 4).map((t) => (
                          <Chip key={t.tag} tone={t.model ? "model" : "neutral"}>
                            {t.label}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
                {lane.items.length === 0 && <li className="rounded-2xl border border-dashed border-line px-3 py-6 text-center text-[12px] text-faint">Arrastra clientes aquí</li>}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="text-[12px] text-faint">
        Arrastra las tarjetas o toca ⋯ para moverlas. Las columnas con temperatura actualizan al cliente (Caliente/Tibio/Frío). Sofía coloca sola a los clientes nuevos y deja de moverlos en cuanto tú los acomodas.
      </p>

      {menuFor && <CardMenu card={menuFor} board={board} onClose={() => setMenuFor(null)} onPost={post} />}
      {editCol && <ColumnEditor col={editCol} columns={board.columns} onClose={() => setEditCol(null)} onPost={post} />}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-panel p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[17px] font-semibold text-ivory">{title}</h3>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full bg-raise text-dim">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CardMenu({ card, board, onClose, onPost }: { card: Card; board: B; onClose: () => void; onPost: (b: Record<string, unknown>) => Promise<void> }) {
  const [tag, setTag] = useState("");
  const act = async (body: Record<string, unknown>, close = true) => {
    await onPost(body);
    if (close) onClose();
  };
  return (
    <Sheet title={card.name} onClose={onClose}>
      <div className="text-[13px] text-dim">Mover a</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {board.columns.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => act({ action: "move", customerId: card.customerId, columnId: c.id })}
            className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-[14px] ${card.columnId === c.id ? "bg-sand text-ink" : "bg-raise text-ivory"}`}
          >
            <span className={`h-2 w-2 rounded-full ${(COLOR_CLASS[c.color] ?? COLOR_CLASS.gray!).dot}`} />
            {c.name}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-[13px] text-dim">
        Mes
        <select
          value={card.period}
          onChange={(e) => act({ action: "move", customerId: card.customerId, period: e.target.value })}
          className="mt-1 w-full rounded-xl bg-raise px-3 py-3 text-[16px] text-ivory"
        >
          {[...board.periods].sort().map((p) => (
            <option key={p} value={p}>
              {periodLabel(p)}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-4 text-[13px] text-dim">Etiquetas</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {card.tags.map((t) => (
          <Chip key={t.tag} tone={t.model ? "model" : "neutral"} onRemove={t.model ? undefined : () => act({ action: "remove_tag", customerId: card.customerId, tag: t.tag }, false)}>
            {t.label}
          </Chip>
        ))}
        {card.tags.length === 0 && <span className="text-[13px] text-faint">Sin etiquetas</span>}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (tag.trim()) void act({ action: "add_tag", customerId: card.customerId, text: tag }, false).then(() => setTag(""));
        }}
      >
        <input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={40} placeholder="Nueva etiqueta (ej. Diciembre, Aguinaldo)" className="min-w-0 flex-1 rounded-xl bg-raise px-3 py-2.5 text-[16px] text-ivory placeholder:text-faint" />
        <button type="submit" className="rounded-xl bg-sand px-4 text-[14px] font-semibold text-ink">
          Agregar
        </button>
      </form>
      <p className="mt-1 text-[11px] text-faint">La etiqueta del modelo la mantiene Sofía según lo que le interesa al cliente.</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href={`/ventas/chat/${card.customerId}`} className="flex min-h-11 items-center justify-center rounded-xl bg-raise text-[14px] text-ivory">
          Abrir chat
        </Link>
        <Link href={`/customers/${card.customerId}`} className="flex min-h-11 items-center justify-center rounded-xl bg-raise text-[14px] text-ivory">
          Ver ficha
        </Link>
      </div>
    </Sheet>
  );
}

function ColumnEditor({ col, columns, onClose, onPost }: { col: B["columns"][number]; columns: B["columns"]; onClose: () => void; onPost: (b: Record<string, unknown>) => Promise<void> }) {
  const [name, setName] = useState(col.name);
  const [color, setColor] = useState(col.color);
  const [temperature, setTemperature] = useState<string>(col.temperature ?? "");
  const isNew = !col.id;
  async function save() {
    if (!name.trim()) return;
    await onPost(isNew ? { action: "add_column", name, color, temperature: temperature || null } : { action: "update_column", id: col.id, name, color, temperature: temperature || null });
    onClose();
  }
  return (
    <Sheet title={isNew ? "Nueva columna" : "Editar columna"} onClose={onClose}>
      <label className="block text-[13px] text-dim">
        Nombre
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Ej. Apartados, Diciembre, Seminuevos" className="mt-1 w-full rounded-xl bg-raise px-3 py-3 text-[16px] text-ivory placeholder:text-faint" />
      </label>
      <div className="mt-3 text-[13px] text-dim">Color</div>
      <div className="mt-2 flex gap-2">
        {COLORS.map((c) => (
          <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} className={`h-9 w-9 rounded-full ${(COLOR_CLASS[c] ?? COLOR_CLASS.gray!).dot} ${color === c ? "ring-2 ring-ivory ring-offset-2 ring-offset-panel" : ""}`} />
        ))}
      </div>
      <label className="mt-3 block text-[13px] text-dim">
        Al mover un cliente aquí, su temperatura pasa a
        <select value={temperature} onChange={(e) => setTemperature(e.target.value)} className="mt-1 w-full rounded-xl bg-raise px-3 py-3 text-[16px] text-ivory">
          {TEMPS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={save} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-sand text-[15px] font-semibold text-ink">
        Guardar
      </button>
      {!isNew && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {([-1, 1] as const).map((dir) => {
            const idx = columns.findIndex((c) => c.id === col.id);
            const to = idx + dir;
            return (
              <button
                key={dir}
                type="button"
                disabled={to < 0 || to >= columns.length}
                onClick={async () => {
                  const ids = columns.map((c) => c.id);
                  [ids[idx], ids[to]] = [ids[to]!, ids[idx]!];
                  await onPost({ action: "reorder", ids });
                  onClose();
                }}
                className="min-h-11 rounded-xl bg-raise text-[14px] text-ivory disabled:opacity-40"
              >
                {dir < 0 ? "← Mover a la izquierda" : "Mover a la derecha →"}
              </button>
            );
          })}
        </div>
      )}
      {!isNew && (
        <button
          type="button"
          onClick={async () => {
            if (!confirm(`¿Quitar la columna “${col.name}”? Sus clientes pasan a la primera columna.`)) return;
            await onPost({ action: "remove_column", id: col.id });
            onClose();
          }}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl text-[14px] text-rose-300"
        >
          Quitar columna
        </button>
      )}
    </Sheet>
  );
}
