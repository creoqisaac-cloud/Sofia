"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { copyText, OUTCOME_TEXT, sendToWhatsApp, type ShareMedia } from "./share";

export const DESK_TABS = [
  { href: "/ventas", label: "Chats" },
  { href: "/ventas/tablero", label: "Tablero" },
  { href: "/ventas/envios", label: "Envíos" },
  { href: "/ventas/modelos", label: "Modelos" },
  { href: "/ventas/estilo", label: "Estilo" },
];

/** Pestañas de Sofía Ventas. */
export function DeskTabs({ counts = {} }: { counts?: Record<string, number> }) {
  const path = usePathname() ?? "/ventas";
  const active = DESK_TABS.filter((t) => path === t.href || (t.href !== "/ventas" && path.startsWith(t.href))).at(-1)?.href ?? (path.startsWith("/ventas/chat") || path.startsWith("/ventas/nuevo") ? "/ventas" : "");
  return (
    <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {DESK_TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium ${active === t.href ? "bg-sand text-ink" : "bg-panel text-dim hover:text-ivory"}`}
        >
          {t.label}
          {counts[t.href] ? <span className={`rounded-full px-1.5 text-[11px] ${active === t.href ? "bg-ink/15" : "bg-alert/20 text-alert"}`}>{counts[t.href]}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export const TEMP_DOT: Record<string, string> = { cold: "bg-sky-400", interested: "bg-amber-400", hot: "bg-orange-500", very_hot: "bg-rose-500" };
export const TEMP_LABEL: Record<string, string> = { cold: "Frío", interested: "Tibio", hot: "Caliente", very_hot: "Muy caliente" };
export const COLOR_CLASS: Record<string, { dot: string; ring: string; soft: string }> = {
  red: { dot: "bg-rose-500", ring: "ring-rose-500/40", soft: "bg-rose-500/10" },
  orange: { dot: "bg-orange-500", ring: "ring-orange-500/40", soft: "bg-orange-500/10" },
  amber: { dot: "bg-amber-400", ring: "ring-amber-400/40", soft: "bg-amber-400/10" },
  green: { dot: "bg-emerald-400", ring: "ring-emerald-400/40", soft: "bg-emerald-400/10" },
  blue: { dot: "bg-sky-400", ring: "ring-sky-400/40", soft: "bg-sky-400/10" },
  violet: { dot: "bg-violet-400", ring: "ring-violet-400/40", soft: "bg-violet-400/10" },
  gray: { dot: "bg-zinc-400", ring: "ring-zinc-500/40", soft: "bg-zinc-500/10" },
};

export function Chip({ children, tone = "neutral", onRemove }: { children: React.ReactNode; tone?: "neutral" | "model" | "sand"; onRemove?: () => void }) {
  const cls = tone === "model" ? "bg-sand/15 text-sand" : tone === "sand" ? "bg-sand text-ink" : "bg-raise text-dim";
  return (
    <span className={`inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[12px] ${cls}`}>
      {children}
      {onRemove && (
        <button type="button" aria-label="Quitar" onClick={onRemove} className="-mr-1 px-1 text-faint hover:text-ivory">
          ×
        </button>
      )}
    </span>
  );
}

/** Miniatura de foto/video/flyer/PDF de la biblioteca. */
export function MediaThumb({ m, size = "md" }: { m: ShareMedia & { kind?: string }; size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? "h-14 w-14" : size === "lg" ? "h-40 w-full" : "h-24 w-24";
  const url = `/api/desk/media/${m.id}`;
  if (m.mimeType.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={`${dim} block shrink-0 overflow-hidden rounded-xl bg-raise`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={m.title} loading="lazy" className="h-full w-full object-cover" />
      </a>
    );
  }
  if (m.mimeType.startsWith("video/")) {
    return (
      <div className={`${dim} relative shrink-0 overflow-hidden rounded-xl bg-raise`}>
        <video src={`${url}#t=0.5`} preload="metadata" muted playsInline controls={size === "lg"} className="h-full w-full object-cover" />
        {size !== "lg" && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl text-white/90 drop-shadow">▶</span>}
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`${dim} flex shrink-0 flex-col items-center justify-center rounded-xl bg-raise p-1 text-center text-[11px] text-dim`}>
      <span className="text-lg">📄</span>
      <span className="line-clamp-2">{m.title}</span>
    </a>
  );
}

/** Botonera de envío: WhatsApp (con archivos) + copiar + marcar enviado. */
export function SendBar({
  phone,
  text,
  media,
  onSent,
  onSkip,
  sentLabel = "Ya lo envié",
  compact = false,
}: {
  phone: string | null;
  text: string;
  media: ShareMedia[];
  onSent?: () => Promise<void> | void;
  onSkip?: () => Promise<void> | void;
  sentLabel?: string;
  compact?: boolean;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      const r = await sendToWhatsApp({ phone, text, media });
      setNote(OUTCOME_TEXT[r]);
      if (r !== "cancelled") setTried(true);
    } catch (e) {
      setNote((e as Error).message || "No se pudo compartir.");
    } finally {
      setBusy(false);
    }
  }
  async function act(fn?: () => Promise<void> | void) {
    if (!fn) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !text.trim()} onClick={send} className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#25D366] px-4 text-[15px] font-semibold text-[#062b14] disabled:opacity-50 ${compact ? "" : "flex-1 justify-center"}`}>
          WhatsApp{media.length ? ` + ${media.length} archivo${media.length === 1 ? "" : "s"}` : ""}
        </button>
        <button
          type="button"
          onClick={async () => setNote((await copyText(text)) ? "Texto copiado." : "No se pudo copiar.")}
          className="inline-flex min-h-11 items-center rounded-xl bg-raise px-4 text-[14px] text-ivory"
        >
          Copiar
        </button>
        {onSent && (
          <button type="button" disabled={busy} onClick={() => act(onSent)} className={`inline-flex min-h-11 items-center rounded-xl px-4 text-[14px] ${tried ? "bg-sand font-semibold text-ink" : "bg-raise text-dim"}`}>
            ✓ {sentLabel}
          </button>
        )}
        {onSkip && (
          <button type="button" disabled={busy} onClick={() => act(onSkip)} className="inline-flex min-h-11 items-center rounded-xl px-3 text-[14px] text-faint hover:text-ivory">
            Descartar
          </button>
        )}
      </div>
      {note && <p className="mt-1.5 text-[12px] text-faint">{note}</p>}
    </div>
  );
}

export function relTime(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.round(h / 24);
  if (days < 7) return `hace ${days} d`;
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export function fmtWhen(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-[14px] text-rose-300">
      {error}
    </p>
  );
}
