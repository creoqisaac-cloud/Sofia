import Link from "next/link";
import type { ReactNode } from "react";
import { CREDIT_APPLICATION_STATUS_LABELS, SALE_STATUS_LABELS, type CreditApplicationStatus, type CrmStage, type SaleStatus, type Temperature } from "@/domain/enums";
import { DemoPill, fmtDate, fmtMoney, Pill, relativeTime, StageBadge, TemperatureBadge, type Tone } from "./ui";

function CardLink({ href, children, accent }: { href: string; children: ReactNode; accent?: boolean }) {
  return (
    <Link href={href} className={`block rounded-2xl bg-panel p-4 active:bg-raise ${accent ? "shadow-[inset_3px_0_0_var(--color-alert)]" : ""}`}>
      {children}
    </Link>
  );
}

export function CustomerCard({
  c,
  now,
}: {
  c: { id: string; displayName: string; vehicle: string | null; stage: CrmStage; temperature: Temperature; lastContactAt: Date | null; nextStep: string | null; pendingCount: number; openAlerts: number; isDemo: boolean };
  now: Date;
}) {
  return (
    <CardLink href={`/customers/${c.id}`} accent={c.openAlerts > 0}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-ivory">
            {c.openAlerts > 0 && "🔥 "}
            {c.displayName}
          </div>
          <div className="truncate text-sm text-zinc-400">{c.vehicle ?? "Sin modelo de interés"}</div>
        </div>
        <span className="shrink-0 text-xs text-faint">{relativeTime(c.lastContactAt, now)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <StageBadge stage={c.stage} />
        <TemperatureBadge temperature={c.temperature} />
        {c.pendingCount > 0 && <Pill tone="amber">{c.pendingCount} pendiente{c.pendingCount === 1 ? "" : "s"}</Pill>}
        {c.openAlerts > 0 && <Pill tone="red">Mario, entra tú</Pill>}
        <DemoPill show={c.isDemo} />
      </div>
      {c.nextStep && <p className="mt-2 line-clamp-2 text-sm text-zinc-300">→ {c.nextStep}</p>}
    </CardLink>
  );
}

export const SALE_TONE: Record<SaleStatus, Tone> = {
  prospect: "neutral",
  negotiation: "violet",
  credit_process: "blue",
  approved: "teal",
  order_created: "teal",
  invoiced: "amber",
  delivery_pending: "orange",
  delivered: "green",
  cancelled: "neutral",
};

export function SaleCard({
  s,
}: {
  s: { id: string; customerName: string; unitDescription: string | null; status: SaleStatus; invoiceDate: Date | null; deliveryDate: Date | null; pending: string[]; isDemo: boolean; orderNumber?: string | null; invoiceNumber?: string | null };
}) {
  const date = s.deliveryDate ? `Entrega ${fmtDate(s.deliveryDate)}` : s.invoiceDate ? `Factura ${fmtDate(s.invoiceDate)}` : null;
  return (
    <CardLink href={`/sales/${s.id}`} accent={s.pending.some((p) => p.includes("vencida"))}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-ivory">{s.customerName}</div>
          <div className="truncate text-sm text-zinc-400">{s.unitDescription ?? "Unidad por definir"}</div>
        </div>
        <Pill tone={SALE_TONE[s.status]}>{SALE_STATUS_LABELS[s.status]}</Pill>
      </div>
      <div className="mt-2 text-[14px] text-dim">
        {s.orderNumber || s.invoiceNumber ? `Pedido ${s.orderNumber ?? "—"} · Factura ${s.invoiceNumber ?? "—"}` : "Sin pedido ni factura"}
      </div>
      {(date || s.pending.length > 0 || s.isDemo) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {date && <Pill>{date}</Pill>}
          {s.pending.map((p) => (
            <Pill key={p} tone={p.includes("vencida") ? "red" : "amber"}>
              {p}
            </Pill>
          ))}
          <DemoPill show={s.isDemo} />
        </div>
      )}
    </CardLink>
  );
}

export function QuoteCard({
  q,
  action,
}: {
  q: { id: string; vehicleLabel: string; effectiveLabel: string; expired: boolean; calculationType: string; downPayment: number; termMonths: number | null; monthlyPayment: number | null; bonus: number; vehiclePrice: number; createdAt: Date; isDemo: boolean; saleId: string | null };
  action?: ReactNode;
}) {
  const tone: Tone = q.expired ? "neutral" : q.calculationType === "official" ? "green" : q.calculationType === "validated_template" ? "teal" : "amber";
  return (
    <div className="rounded-2xl bg-panel p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-ivory">{q.vehicleLabel}</div>
          <div className="text-xs text-faint">{fmtDate(q.createdAt, true)}</div>
        </div>
        <Pill tone={tone}>{q.effectiveLabel}</Pill>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <div className="text-xs text-faint">Enganche</div>
          {fmtMoney(q.downPayment)}
        </div>
        <div>
          <div className="text-xs text-faint">Plazo</div>
          {q.termMonths ? `${q.termMonths} m` : "Contado"}
        </div>
        <div>
          <div className="text-xs text-faint">Mensualidad</div>
          {fmtMoney(q.monthlyPayment)}
        </div>
        <div>
          <div className="text-xs text-faint">Precio</div>
          {fmtMoney(q.vehiclePrice)}
        </div>
        <div>
          <div className="text-xs text-faint">Bono</div>
          {fmtMoney(q.bonus)}
        </div>
        <div className="flex items-end">
          <DemoPill show={q.isDemo} />
        </div>
      </div>
      {q.saleId ? (
        <Link href={`/sales/${q.saleId}`} className="mt-3 block text-sm text-sand">
          Ver venta asociada →
        </Link>
      ) : (
        action && <div className="mt-3">{action}</div>
      )}
    </div>
  );
}

export const APP_TONE: Record<CreditApplicationStatus, Tone> = {
  draft: "neutral",
  missing_information: "amber",
  conflict: "red",
  ready_for_review: "blue",
  ready_for_signature: "violet",
  submitted: "teal",
  approved: "green",
  rejected: "red",
  cancelled: "neutral",
};

export function CreditApplicationCard({
  a,
  customerId,
}: {
  a: { id: string; institutionName: string; status: CreditApplicationStatus; createdAt: Date; totals: { confirmed: number; missing: number; conflicts: number; needsConfirmation: number; human: number; signatures: number } | null };
  customerId: string;
}) {
  return (
    <CardLink href={`/customers/${customerId}/credit/${a.id}`} accent={a.status === "conflict"}>
      <div className="flex items-center gap-2">
        <div className="flex-1 text-base font-semibold text-ivory">Solicitud {a.institutionName}</div>
        <Pill tone={APP_TONE[a.status]}>{CREDIT_APPLICATION_STATUS_LABELS[a.status]}</Pill>
      </div>
      <div className="mt-1 text-xs text-faint">Creada {fmtDate(a.createdAt)}</div>
      {a.totals && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Pill tone="green">✅ {a.totals.confirmed}</Pill>
          {a.totals.conflicts > 0 && <Pill tone="red">⚠️ {a.totals.conflicts}</Pill>}
          {a.totals.missing > 0 && <Pill tone="amber">⬜ {a.totals.missing}</Pill>}
          {a.totals.needsConfirmation > 0 && <Pill tone="amber">🔎 {a.totals.needsConfirmation}</Pill>}
          <Pill>👤 {a.totals.human}</Pill>
          <Pill>✍️ {a.totals.signatures}</Pill>
        </div>
      )}
    </CardLink>
  );
}

export function AlertCard({ title, detail, customerName, href, severity, children }: { title: string; detail?: string; customerName: string; href: string; severity: "high" | "medium" | "low"; children?: ReactNode }) {
  const border = severity === "high" ? "border-rose-500/50" : severity === "medium" ? "border-amber-500/40" : "border-zinc-800";
  return (
    <div className={`rounded-2xl border ${border} bg-panel p-4`}>
      <Link href={href} className="block">
        <div className="text-base font-semibold text-ivory">{title}</div>
        <div className="text-sm text-zinc-300">{customerName}</div>
        {detail && <div className="mt-1 text-sm text-faint">{detail}</div>}
      </Link>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function MissingDataCard({ items, href }: { items: string[]; href?: string }) {
  if (!items.length) return null;
  const body = (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="text-sm font-semibold text-amber-300">⬜ Datos faltantes ({items.length})</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.slice(0, 12).map((i) => (
          <Pill key={i} tone="amber">
            {i}
          </Pill>
        ))}
        {items.length > 12 && <Pill>+{items.length - 12}</Pill>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function ApplicationProgress({ sections }: { sections: Array<{ id: string; label: string; required: number; complete: number; conflicts: number; needsConfirmation: number; human: number; signatures: number }> }) {
  return (
    <ul className="space-y-3">
      {sections.map((s) => {
        const pct = s.required ? Math.round((s.complete / s.required) * 100) : 100;
        const informative = s.required === 0;
        return (
          <li key={s.id}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-zinc-200">{s.label}</span>
              <span className="text-zinc-400">
                {informative ? (s.signatures ? `${s.signatures} firma(s)` : s.human ? `${s.human} confirmación(es) del cliente` : "—") : `${s.complete}/${s.required} completos`}
                {s.needsConfirmation > 0 && <span className="ml-2 text-amber-300">🔎 {s.needsConfirmation}</span>}
                {s.conflicts > 0 && <span className="ml-2 text-rose-400">⚠️ {s.conflicts}</span>}
              </span>
            </div>
            {!informative && (
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800">
                <div className={`h-full ${pct === 100 ? "bg-emerald-500" : s.conflicts ? "bg-rose-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function StatusTimeline({ items }: { items: Array<{ id: string; title: string; detail?: string | null; at: Date; actor?: string | null }> }) {
  if (!items.length) return <p className="text-sm text-faint">Sin historial.</p>;
  return (
    <ol className="relative space-y-4 border-l border-zinc-800 pl-4">
      {items.map((it) => (
        <li key={it.id}>
          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-zinc-600" />
          <div className="text-sm text-zinc-100">{it.title}</div>
          {it.detail && <div className="text-sm text-zinc-400">{it.detail}</div>}
          <div className="text-xs text-faint">
            {fmtDate(it.at, true)}
            {it.actor ? ` · ${it.actor}` : ""}
          </div>
        </li>
      ))}
    </ol>
  );
}
