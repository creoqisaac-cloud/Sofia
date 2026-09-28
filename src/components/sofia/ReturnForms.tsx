"use client";

import { useActionState, useTransition } from "react";
import { calibrateProgramAction, createReturnAction, returnStatusAction, type ActionState } from "@/app/actions";

const field = "mt-1 w-full rounded-xl bg-raise px-3 py-3 text-[17px] text-ivory focus:outline-none";

export function NewReturnForm({ customers }: { customers: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createReturnAction, null);
  return (
    <form action={action} className="rounded-3xl bg-panel p-5">
      <label className="block text-[13px] text-dim">
        Cliente
        <select name="customerId" className={field}>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-[13px] text-dim">
        Motivo (texto libre)
        <input name="reason" className={field} />
      </label>
      <label className="mt-3 block text-[13px] text-dim">
        Monto (si aplica)
        <input name="amount" inputMode="decimal" className={field} />
      </label>
      <label className="mt-3 block text-[13px] text-dim">
        Notas
        <textarea name="notes" rows={2} className={field} />
      </label>
      <button type="submit" disabled={pending} className="mt-4 min-h-12 w-full rounded-2xl bg-raise text-[16px] text-ivory">
        Registrar
      </button>
      {state && <p className={`mt-2 text-[14px] ${state.ok ? "text-good" : "text-alert"}`}>{state.message ?? state.error}</p>}
    </form>
  );
}

export function ReturnStatusButtons({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  if (status !== "open") return null;
  const set = (s: "resolved" | "cancelled") => start(async () => void (await returnStatusAction(id, s)));
  return (
    <div className="mt-2 flex gap-2">
      <button type="button" disabled={pending} onClick={() => set("resolved")} className="min-h-9 rounded-full bg-raise px-3.5 text-[14px] text-ivory">
        Resuelta
      </button>
      <button type="button" disabled={pending} onClick={() => set("cancelled")} className="min-h-9 rounded-full bg-raise px-3.5 text-[14px] text-dim">
        Cancelar
      </button>
    </div>
  );
}

export function CalibrateButton({ programId }: { programId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(() => calibrateProgramAction(programId), null);
  return (
    <form action={action}>
      <button type="submit" disabled={pending} className="min-h-10 rounded-full bg-raise px-4 text-[14px] text-ivory">
        {pending ? "Calibrando…" : "Calibrar contra corridas"}
      </button>
      {state && <p className={`mt-2 text-[13px] ${state.ok ? "text-good" : "text-alert"}`}>{state.message ?? state.error}</p>}
    </form>
  );
}
