import Link from "next/link";
import { and, asc, eq, gte } from "drizzle-orm";
import { PilotLeadForm } from "@/components/sofia/PilotLeadForm";
import { AppointmentButtons } from "@/components/sofia/AgendaForms";
import { MobileHeader } from "@/components/app/AppShell";
import { getAppContext } from "@/server/app";
import { pilotConfirmationText } from "@/server/services/pilot-delivery";
import * as s from "@/server/db/schema";

export const dynamic = "force-dynamic";

function asModel(notes: string | null): string {
  return /Modelo de interés: Honda ([^.]+)/.exec(notes ?? "")?.[1] ?? "Honda";
}

export default async function PilotPage({ searchParams }: { searchParams: Promise<{ cita?: string }> }) {
  const { cita } = await searchParams;
  const app = await getAppContext();
  const now = app.clock.now();
  const dateParts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Monterrey", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const datePart = (type: string) => dateParts.find(p => p.type === type)?.value ?? "";
  const today = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
  const appointments = await app.db.select({
    appointment: s.appointments, name: s.customers.displayName, phone: s.customers.phone, isDemo: s.customers.isDemo,
  }).from(s.appointments).innerJoin(s.customers, eq(s.customers.id, s.appointments.customerId))
    .where(and(eq(s.appointments.workspaceId, app.workspaceId), gte(s.appointments.scheduledAt, now)))
    .orderBy(asc(s.appointments.scheduledAt)).limit(30);
  const selected = cita && /^[a-f0-9-]{36}$/i.test(cita) ? await app.db.select({
    appointment: s.appointments, name: s.customers.displayName, phone: s.customers.phone, isDemo: s.customers.isDemo,
  }).from(s.appointments).innerJoin(s.customers, eq(s.customers.id, s.appointments.customerId))
    .where(and(eq(s.appointments.id, cita), eq(s.appointments.workspaceId, app.workspaceId))).limit(1) : [];
  const receipt = selected[0];
  const fmt = (at: Date) => new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Monterrey", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(at);
  const active = appointments.filter(x => ["scheduled", "confirmed"].includes(x.appointment.status));
  return (
    <>
      <MobileHeader title="Sofía para Mario" subtitle="Piloto comercial · Honda Valle Oriente" />
      <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-10">
        <header className="pt-2">
          <h1 className="text-[25px] font-semibold text-ivory">Citas y prospectos</h1>
          <p className="mt-1 text-[14px] text-dim">Versión supervisada para trabajar desde el celular. No es una conexión automática activa a WhatsApp o BIKY.</p>
        </header>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-panel p-3 text-center">
            <div className="text-[28px] font-bold text-ivory">{active.length}</div>
            <div className="text-[11px] text-dim">Próximas citas</div>
          </div>
          <div className="rounded-2xl bg-panel p-3 text-center">
            <div className="text-[28px] font-bold text-ivory">{active.filter(x => x.appointment.status === "confirmed").length}</div>
            <div className="text-[11px] text-dim">Confirmadas</div>
          </div>
          <div className="rounded-2xl bg-panel p-3 text-center">
            <div className="text-[28px] font-bold text-ivory">{active.filter(x => x.appointment.status === "scheduled").length}</div>
            <div className="text-[11px] text-dim">Por confirmar</div>
          </div>
        </div>
        {receipt && (
          <section className="rounded-3xl border border-sand bg-panel p-5" aria-label="Cita guardada">
            <h2 className="text-[20px] font-semibold text-ivory">Solicitud de cita guardada</h2>
            <p className="mt-2 text-[16px] text-ivory">{receipt.name} · Honda {asModel(receipt.appointment.notes)}</p>
            <p className="mt-1 text-[14px] text-dim">{receipt.appointment.scheduledAt ? fmt(receipt.appointment.scheduledAt) : "Hora pendiente"} · {receipt.appointment.status === "confirmed" ? "Confirmada por Mario" : "Pendiente de confirmar"}</p>
            {receipt.phone && receipt.appointment.scheduledAt && !receipt.isDemo && (
              <a className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-sand px-3 text-center text-[15px] font-semibold text-ink" href={`https://wa.me/${receipt.phone.replace(/\D/g, "").replace(/^521(?=\d{10}$)/, "52")}?text=${encodeURIComponent(pilotConfirmationText({
                name: receipt.name, model: asModel(receipt.appointment.notes),
                kind: receipt.appointment.kind === "test_drive" ? "test_drive" : "visit",
                at: receipt.appointment.scheduledAt, confirmed: receipt.appointment.status === "confirmed",
              }))}`} target="_blank" rel="noopener noreferrer">
                Abrir confirmación en WhatsApp
              </a>
            )}
            <p className="mt-2 text-[12px] text-faint">El texto se abre para revisión. No se envía automáticamente.</p>
            <AppointmentButtons id={receipt.appointment.id} status={receipt.appointment.status} />
            <Link href="/piloto" className="mt-3 block text-[13px] text-sand underline">Capturar otra cita</Link>
          </section>
        )}
        <PilotLeadForm today={today} />
        <section className="rounded-3xl bg-panel p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[19px] font-semibold text-ivory">Agenda de Mario</h2>
            <Link href="/agenda" className="text-[13px] text-sand">Ver toda</Link>
          </div>
          {active.length === 0 ? <p className="mt-3 text-[14px] text-dim">Sin citas agendadas. Captura la primera arriba.</p> :
            <ul className="mt-2 divide-y divide-line">
              {active.slice(0, 12).map(({ appointment, name }) => (
                <li key={appointment.id} className="flex items-center gap-3 py-3">
                  <span className="w-24 shrink-0 text-[13px] text-sand">{appointment.scheduledAt ? fmt(appointment.scheduledAt) : "Pendiente"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-ivory">{name}</span>
                    <span className="block text-[12px] text-dim">{appointment.status === "confirmed" ? "Confirmada" : "Por confirmar"}</span>
                  </span>
                  <Link href={`/piloto?cita=${appointment.id}`} className="text-[13px] text-sand">Abrir</Link>
                </li>
              ))}
            </ul>}
        </section>
        <p className="text-[12px] text-faint">Sofía · Piloto de ventas para Mario Abarca. La automatización bidireccional de WhatsApp sigue en integración; no usar información comercial DEMO para cotizaciones reales.</p>
      </main>
    </>
  );
}
