"use client";

/** Recordatorios y alarmas: permisos, prueba, nuevo recordatorio y lista de lo programado. */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { notificationPermission, notificationsAvailable, openExactAlarmSetting, requestNotificationPermission, scheduleTestAlarm, syncDeviceReminders } from "./native";

const field = "mt-1 w-full rounded-xl bg-raise px-3 py-3 text-[17px] text-ivory focus:outline-none";
const big = "flex min-h-14 items-center justify-center rounded-2xl px-4 text-[16px]";

type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p className={`mt-2 text-[14px] ${m.ok ? "text-good" : "text-alert"}`}>{m.text}</p> : null);

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function defaultWhen() {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(0, 0, 0);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:00` };
}

/** Formulario "Recuérdame…" (con o sin cliente). La hora es la de la tablet. */
export function ReminderForm({ customerId, customers }: { customerId?: string; customers?: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const init = defaultWhen();
  const [text, setText] = useState("");
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [alarm, setAlarm] = useState(false);
  const [cid, setCid] = useState(customerId ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [calendarKey, setCalendarKey] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const at = new Date(`${date}T${time}:00`);
      if (Number.isNaN(at.getTime())) throw new Error("Fecha u hora inválida.");
      const r = await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ at: at.toISOString(), text, alarm, customerId: cid || null }) });
      const j = (await r.json()) as { error?: string; reminder?: { id: string } };
      if (!r.ok) throw new Error(j.error ?? "No se pudo guardar.");
      const n = await syncDeviceReminders().catch(() => 0);
      setText("");
      setCalendarKey(j.reminder?.id ? `reminder:${j.reminder.id}:${at.toISOString()}` : null);
      setMsg({ ok: true, text: notificationsAvailable()
        ? `Aviso para ${at.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}. (${n} aviso(s) programados en Android)`
        : "Guardado en Sofía. Para recibirlo en iPhone cuando la app esté cerrada, agrega el evento a Calendario y confirma la importación." });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-3xl bg-panel p-5">
      <div className="text-[16px] text-ivory">Recuérdame…</div>
      <input value={text} onChange={(e) => setText(e.target.value)} required maxLength={200} placeholder="Llamar para confirmar la cita" className={field} />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={field} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className={field} />
      </div>
      {customers && !customerId && (
        <select value={cid} onChange={(e) => setCid(e.target.value)} className={field}>
          <option value="">Sin cliente</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <label className="mt-3 flex items-center gap-3 text-[16px] text-ivory">
        <input type="checkbox" checked={alarm} onChange={(e) => setAlarm(e.target.checked)} className="h-6 w-6" /> Como alarma (prioridad máxima)
      </label>
      <button type="submit" disabled={busy} className={`${big} mt-4 w-full bg-sand font-semibold text-ink`}>
        {busy ? "Guardando…" : "Guardar recordatorio"}
      </button>
      <Note m={msg} />
      {calendarKey && !notificationsAvailable() && (
        <a href={`/api/reminders/calendar?key=${encodeURIComponent(calendarKey)}`}
          className="mt-3 flex min-h-12 items-center justify-center rounded-2xl bg-raise text-[15px] text-ivory">
          Descargar evento para Calendario de iPhone
        </a>
      )}
    </form>
  );
}

/** Estado de permisos y prueba de alarma (solo en la APK). */
export function NotificationSetup() {
  const [state, setState] = useState<{ native: boolean; display: string; exact: string | null } | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const refresh = async () => {
    const native = notificationsAvailable();
    const p = native ? await notificationPermission().catch(() => ({ display: "unknown", exact: null })) : { display: "unavailable", exact: null };
    setState({ native, ...p });
  };
  useEffect(() => {
    let alive = true;
    const native = notificationsAvailable();
    (native ? notificationPermission().catch(() => ({ display: "unknown", exact: null })) : Promise.resolve({ display: "unavailable", exact: null })).then((p) => {
      if (alive) setState({ native, ...p });
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!state) return null;
  if (!state.native) {
    return <section className="rounded-3xl bg-panel p-5 text-[15px] text-dim">En iPhone puedes guardar recordatorios y exportarlos a Calendario, con un aviso al momento del evento. Debes importarlos y confirmar en Calendario. Las notificaciones push automáticas de Sofía todavía no están configuradas.</section>;
  }
  return (
    <section className="rounded-3xl bg-panel p-5">
      <div className="text-[16px] text-ivory">Avisos en esta tablet</div>
      <ul className="mt-2 space-y-1 text-[15px]">
        <li>
          Notificaciones: <span className={state.display === "granted" ? "text-good" : "text-alert"}>{state.display === "granted" ? "activadas" : "desactivadas"}</span>
        </li>
        {state.exact !== null && (
          <li>
            Hora exacta (alarmas): <span className={state.exact === "granted" ? "text-good" : "text-alert"}>{state.exact === "granted" ? "permitida" : "no permitida (pueden llegar unos minutos tarde)"}</span>
          </li>
        )}
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {state.display !== "granted" && (
          <button type="button" onClick={async () => { await requestNotificationPermission(); await refresh(); }} className={`${big} col-span-2 bg-sand font-semibold text-ink`}>
            Activar notificaciones
          </button>
        )}
        {state.exact !== null && state.exact !== "granted" && (
          <button type="button" onClick={async () => { await openExactAlarmSetting(); await refresh(); }} className={`${big} col-span-2 bg-raise text-ivory`}>
            Permitir alarmas a la hora exacta
          </button>
        )}
        <button type="button" onClick={async () => { try { await scheduleTestAlarm(10); setMsg({ ok: true, text: "Alarma de prueba en 10 segundos. Puedes cerrar la app." }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } }} className={`${big} bg-raise text-ivory`}>
          Probar alarma
        </button>
        <button type="button" onClick={async () => { const n = await syncDeviceReminders().catch(() => 0); setMsg({ ok: true, text: `${n} aviso(s) programados en la tablet.` }); }} className={`${big} bg-raise text-ivory`}>
          Actualizar avisos
        </button>
      </div>
      <Note m={msg} />
    </section>
  );
}

export function RemoveReminderButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/reminders/${id}`, { method: "DELETE" });
        await syncDeviceReminders().catch(() => 0);
        router.refresh();
      }}
      className="min-h-11 rounded-xl bg-raise px-3 text-[14px] text-dim"
    >
      Quitar
    </button>
  );
}
