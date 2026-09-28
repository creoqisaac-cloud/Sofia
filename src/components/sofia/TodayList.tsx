"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { contactedAction, followupOpAction } from "@/app/actions";
import { IconChevron, IconPhone } from "./icons";

export interface TodayItemView {
  key: string;
  kind: string;
  customerId: string;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
  followupId?: string;
  phone?: string | null;
  isDemo: boolean;
}

const FOLLOW_KINDS = new Set(["followup", "promise", "no_response", "quote_waiting"]);

export function TodayList({ items }: { items: TodayItemView[] }) {
  if (!items.length) return <p className="py-6 text-center text-[15px] text-faint">Nada urgente por ahora.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((it) => (
        <TodayRow key={it.key} it={it} />
      ))}
    </ul>
  );
}

function TodayRow({ it }: { it: TodayItemView }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const follow = FOLLOW_KINDS.has(it.kind);
  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string } | null>) =>
    start(async () => {
      const r = await fn();
      setNote(r?.ok ? (r.message ?? "Listo") : (r?.error ?? "No se pudo"));
    });
  return (
    <li className="py-3.5">
      <Link href={it.href} className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-medium leading-snug text-ivory">
            {it.title}
            {it.isDemo && <span className="ml-2 align-middle text-[10px] tracking-wider text-faint">DEMO</span>}
          </div>
          <div className="text-[15px] leading-snug text-dim">{it.detail}</div>
          <div className="mt-1 text-[15px] text-sand">→ {it.actionLabel}</div>
        </div>
        <IconChevron className="mt-1 shrink-0 text-faint" width={18} height={18} />
      </Link>
      {follow && !note && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {it.phone && (
            <a href={`tel:${it.phone}`} onClick={() => act(() => contactedAction(it.customerId, it.followupId ?? null))} className="flex min-h-9 items-center gap-1.5 rounded-full bg-raise px-3.5 text-[14px] text-ivory">
              <IconPhone width={16} height={16} /> Contactar
            </a>
          )}
          {it.followupId && (
            <>
              <button type="button" disabled={pending} onClick={() => act(() => followupOpAction(it.followupId!, "postpone"))} className="min-h-9 rounded-full bg-raise px-3.5 text-[14px] text-ivory">
                Posponer
              </button>
              <button type="button" disabled={pending} onClick={() => act(() => followupOpAction(it.followupId!, "done"))} className="min-h-9 rounded-full bg-raise px-3.5 text-[14px] text-ivory">
                Completado
              </button>
            </>
          )}
          {!it.followupId && (
            <button type="button" disabled={pending} onClick={() => act(() => contactedAction(it.customerId, null))} className="min-h-9 rounded-full bg-raise px-3.5 text-[14px] text-ivory">
              Ya lo contacté
            </button>
          )}
          <Link href={`/agenda?new=${it.customerId}`} className="flex min-h-9 items-center rounded-full bg-raise px-3.5 text-[14px] text-ivory">
            Crear cita
          </Link>
        </div>
      )}
      {note && <p className="mt-2 text-[13px] text-good">{note}</p>}
    </li>
  );
}
