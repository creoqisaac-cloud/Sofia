/**
 * Sistema visual de la app operativa (oscuro, alto contraste, táctil).
 * Objetivos táctiles ≥ 44 px; inputs a 16 px para evitar el zoom de iOS.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { CRM_STAGE_LABELS, TEMPERATURE_LABELS, type CrmStage, type Temperature } from "@/domain/enums";

export type Tone = "neutral" | "green" | "amber" | "red" | "blue" | "violet" | "orange" | "teal";

const TONE: Record<Tone, string> = {
  neutral: "bg-zinc-800 text-zinc-200 ring-zinc-700",
  green: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  red: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  blue: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  violet: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  orange: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  teal: "bg-teal-500/15 text-teal-300 ring-teal-500/30",
};

export function Pill({ children, tone = "neutral", title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[tone]}`}>
      {children}
    </span>
  );
}

export const TEMPERATURE_TONE: Record<Temperature, Tone> = { cold: "blue", interested: "amber", hot: "orange", very_hot: "red" };
const TEMPERATURE_ICON: Record<Temperature, string> = { cold: "❄︎", interested: "◐", hot: "🔥", very_hot: "🔥🔥" };

export function TemperatureBadge({ temperature }: { temperature: Temperature }) {
  return <Pill tone={TEMPERATURE_TONE[temperature]}>{TEMPERATURE_ICON[temperature]} {TEMPERATURE_LABELS[temperature]}</Pill>;
}

export function StageBadge({ stage }: { stage: CrmStage }) {
  const tone: Tone = stage === "sold" ? "green" : stage === "not_interested" ? "neutral" : stage === "closing" || stage === "negotiation" ? "violet" : "teal";
  return <Pill tone={tone}>{CRM_STAGE_LABELS[stage]}</Pill>;
}

export function DemoPill({ show = true }: { show?: boolean }) {
  return show ? <Pill tone="violet" title="Dato ficticio de prueba">DEMO</Pill> : null;
}

export function SectionCard({ title, children, action, id, subtitle }: { title?: string; subtitle?: string; children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
      {(title || action) && (
        <header className="mb-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-center text-sm text-zinc-500">
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

const BTN = {
  primary: "bg-emerald-500 text-zinc-950 hover:bg-emerald-400",
  secondary: "bg-zinc-800 text-zinc-100 ring-1 ring-zinc-700 hover:bg-zinc-700",
  danger: "bg-rose-600 text-white hover:bg-rose-500",
  ghost: "text-zinc-300 hover:bg-zinc-800",
} as const;

export function buttonClass(variant: keyof typeof BTN = "primary", block = false) {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BTN[variant]} ${block ? "w-full" : ""}`;
}

export function LinkButton({ href, children, variant = "primary", block }: { href: string; children: ReactNode; variant?: keyof typeof BTN; block?: boolean }) {
  return (
    <Link href={href} className={buttonClass(variant, block)}>
      {children}
    </Link>
  );
}

export function KeyValue({ items }: { items: Array<{ k: string; v: ReactNode; hint?: ReactNode }> }) {
  return (
    <dl className="divide-y divide-zinc-800">
      {items.map((it) => (
        <div key={it.k} className="flex items-start justify-between gap-3 py-2 text-sm">
          <dt className="text-zinc-400">{it.k}</dt>
          <dd className="text-right text-zinc-100">
            {it.v}
            {it.hint && <div className="text-xs text-zinc-500">{it.hint}</div>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Stat({ label, value, href, tone = "neutral" }: { label: string; value: number; href?: string; tone?: Tone }) {
  const body = (
    <div className={`flex min-h-20 flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 ${value > 0 && tone !== "neutral" ? "ring-1 ring-inset " + TONE[tone].split(" ").filter((c) => c.startsWith("ring-")).join(" ") : ""}`}>
      <span className="text-xs leading-tight text-zinc-400">{label}</span>
      <span className={`text-2xl font-bold ${value > 0 ? "text-zinc-50" : "text-zinc-600"}`}>{value}</span>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function ChipNav({ items, active }: { items: Array<{ key: string; label: string; href: string; count?: number }>; active: string }) {
  return (
    <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          scroll={false}
          className={`inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-4 text-sm font-medium ${it.key === active ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900 text-zinc-300 ring-1 ring-zinc-800"}`}
        >
          {it.label}
          {it.count !== undefined && it.count > 0 && <span className="text-xs opacity-70">{it.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const cents = Math.round(n * 100) % 100 !== 0;
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
}

export function fmtDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("es-MX", withTime ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" });
}

export function relativeTime(d: Date | null | undefined, now = new Date()): string {
  if (!d) return "sin contacto";
  const mins = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}
