"use client";

import { useActionState, useState, useTransition } from "react";
import { appointmentStatusAction, createFollowupAction, scheduleAppointmentAction, type ActionState } from "@/app/actions";

const field = "mt-1 w-full rounded-xl bg-raise px-3 py-3 text-[17px] text-ivory focus:outline-none";

function Msg({ s }: { s: ActionState }) {
  if (!s) return null;
  return <p className={`mt-3 text-[14px] ${s.ok ? "text-good" : "text-alert"}`}>{s.message ?? s.error}</p>;
}

export function NewAgendaItem({ customers, defaultCustomerId, today }: { customers: Array<{ id: string; name: string }>; defaultCustomerId?: string; today: string }) {
  const [kind, setKind] = useState<"cita" | "seguimiento">("cita");
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? customers[0]?.id ?? "");
  const [apptState, apptAction, p1] = useActionState<ActionState, FormData>((prev, fd) => scheduleAppointmentAction(customerId, prev, fd), null);
  const [fuState, fuAction, p2] = useActionState<ActionState, FormData>((prev, fd) => createFollowupAction(customerId, prev, fd), null);
  return (
    <div className="rounded-3xl bg-panel p-5">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-raise p-1">
        {(["cita", "seguimiento"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`min-h-10 rounded-lg text-[15px] ${kind === k ? "bg-panel text-ivory" : "text-dim"}`}>
            {k === "cita" ? "Cita" : "Seguimiento"}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-[13px] text-dim">
        Cliente
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={field}>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {kind === "cita" ? (
        <form action={apptAction}>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-[13px] text-dim">
              Fecha
              <input type="date" name="date" defaultValue={today} required className={field} />
            </label>
            <label className="text-[13px] text-dim">
              Hora
              <input type="time" name="time" defaultValue="17:00" required className={field} />
            </label>
          </div>
          <label className="mt-3 block text-[13px] text-dim">
            Motivo
            <select name="kind" className={field} defaultValue="visit">
              <option value="visit">Visita</option>
              <option value="test_drive">Prueba de manejo</option>
              <option value="signature">Firma</option>
              <option value="delivery">Entrega</option>
              <option value="call">Llamada</option>
            </select>
          </label>
          <label className="mt-3 block text-[13px] text-dim">
            Ubicación / notas
            <input name="location" placeholder="Agencia" className={field} />
          </label>
          <button type="submit" disabled={p1 || !customerId} className="mt-4 min-h-12 w-full rounded-2xl bg-sand text-[16px] font-semibold text-ink">
            Agendar
          </button>
          <Msg s={apptState} />
        </form>
      ) : (
        <form action={fuAction}>
          <label className="mt-3 block text-[13px] text-dim">
            Motivo
            <input name="reason" required placeholder="Llamar para confirmar documentos" className={field} />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-[13px] text-dim">
              Fecha
              <input type="date" name="date" defaultValue={today} required className={field} />
            </label>
            <label className="text-[13px] text-dim">
              Hora
              <input type="time" name="time" defaultValue="10:00" className={field} />
            </label>
          </div>
          <label className="mt-3 flex min-h-11 items-center gap-3 text-[15px] text-ivory">
            <input type="checkbox" name="promise" className="h-5 w-5 accent-[var(--color-sand)]" /> Se lo prometí al cliente
          </label>
          <button type="submit" disabled={p2 || !customerId} className="mt-3 min-h-12 w-full rounded-2xl bg-sand text-[16px] font-semibold text-ink">
            Crear seguimiento
          </button>
          <Msg s={fuState} />
        </form>
      )}
    </div>
  );
}

export function AppointmentButtons({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const btn = "min-h-9 rounded-full bg-raise px-3.5 text-[14px] text-ivory disabled:opacity-40";
  const set = (s: "confirmed" | "completed" | "cancelled" | "no_show") => start(async () => void (await appointmentStatusAction(id, s)));
  if (!["scheduled", "confirmed"].includes(status)) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {status === "scheduled" && (
        <button type="button" disabled={pending} onClick={() => set("confirmed")} className={btn}>
          Confirmada
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => set("completed")} className={btn}>
        Realizada
      </button>
      <button type="button" disabled={pending} onClick={() => set("no_show")} className={btn}>
        No asistió
      </button>
      <button type="button" disabled={pending} onClick={() => set("cancelled")} className={btn}>
        Cancelar
      </button>
    </div>
  );
}
