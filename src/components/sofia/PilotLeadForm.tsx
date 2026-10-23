"use client";

import { useActionState } from "react";
import { registerPilotAction, type PilotFormState } from "@/app/piloto/actions";
import { HONDA_MODELS } from "@/domain/pilot";

const style = "mt-1 block min-h-12 w-full rounded-xl bg-raise px-4 py-3 text-[16px] text-ivory";

export function PilotLeadForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<PilotFormState, FormData>(registerPilotAction, null);
  return (
    <form action={action} className="rounded-3xl bg-panel p-5">
      <h2 className="text-[20px] font-semibold text-ivory">Nueva cita desde WhatsApp</h2>
      <p className="mt-1 text-[13px] text-dim">Registra un prospecto y prepara el mensaje de confirmación sin salir de Sofía.</p>
      <div className="mt-4 grid gap-3">
        <label className="text-[13px] text-dim">
          Nombre del cliente
          <input name="name" required maxLength={100} autoComplete="name" placeholder="Ej. Carlos Martínez" className={style}/>
        </label>
        <label className="text-[13px] text-dim">
          Celular / WhatsApp
          <input name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="81 1234 5678" className={style}/>
        </label>
        <label className="text-[13px] text-dim">
          Modelo de interés
          <select name="model" className={style} defaultValue="CR-V">
            {HONDA_MODELS.map(model => <option key={model} value={model}>{model}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[13px] text-dim">Día
            <input name="date" type="date" min={today} defaultValue={today} required className={style} />
          </label>
          <label className="text-[13px] text-dim">Hora
            <input name="time" type="time" defaultValue="17:00" required className={style}/>
          </label>
        </div>
        <label className="text-[13px] text-dim">Tipo de cita
          <select name="kind" defaultValue="test_drive" className={style}>
            <option value="test_drive">Prueba de manejo</option>
            <option value="visit">Visita a la agencia</option>
          </select>
        </label>
      </div>
      {state?.error && <p role="alert" className="mt-3 text-[13px] text-alert">{state.error}</p>}
      <button type="submit" disabled={pending} className="mt-4 min-h-14 w-full rounded-2xl bg-sand text-[16px] font-semibold text-ink disabled:opacity-50">
        {pending ? "Guardando…" : "Guardar y preparar WhatsApp"}
      </button>
      <p className="mt-3 text-[12px] text-faint">La cita queda agendada, pendiente de confirmar con el cliente. Verifica también los horarios de la agencia o de BIKY. El WhatsApp se abre como borrador; Mario decide enviarlo.</p>
    </form>
  );
}
