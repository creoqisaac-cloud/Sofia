import type { ReactNode } from "react";
import { INFO_STATUS_LABELS, type InfoStatus, type Temperature } from "@/domain/enums";

const TONES = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  dark: "bg-slate-800 text-white ring-slate-800",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ children, tone = "gray", title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<InfoStatus, Tone> = {
  confirmed: "green",
  official_quote: "dark",
  validated_quote: "teal",
  estimate: "amber",
  historical: "gray",
  unknown: "red",
};

export function StatusBadge({ status }: { status: InfoStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{INFO_STATUS_LABELS[status]}</Badge>;
}

export const TEMPERATURE_TONE: Record<Temperature, Tone> = { cold: "blue", interested: "amber", hot: "orange", very_hot: "red" };

export function DemoBadge({ show = true }: { show?: boolean }) {
  return show ? <Badge tone="violet" title="Dato ficticio de prueba">DEMO</Badge> : null;
}

export function Section({ title, children, right, defaultOpen = true }: { title: string; children: ReactNode; right?: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-b border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50">
        <span className="transition-transform group-open:rotate-90">›</span>
        <span>{title}</span>
        <span className="ml-auto font-normal normal-case tracking-normal">{right}</span>
      </summary>
      <div className="px-4 pb-3 text-sm">{children}</div>
    </details>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-xs italic text-slate-400">{children}</p>;
}

export function Button({
  children,
  onClick,
  tone = "default",
  disabled,
  type = "button",
  small,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "default" | "primary" | "danger" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  small?: boolean;
}) {
  const tones = {
    default: "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50",
    primary: "bg-emerald-600 text-white hover:bg-emerald-700",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${small ? "px-2 py-0.5 text-xs" : "px-3 py-1.5 text-sm"} rounded font-medium disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
