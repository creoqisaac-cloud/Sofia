"use client";

import { useActionState, useTransition } from "react";
import { addPlateRequirementAction, draftPlatesEmailAction, openPlateCaseAction, plateCaseAction, plateRequirementAction, platesRecipientAction, removePlateRequirementAction, type ActionState } from "@/app/actions";

const field = "mt-1 w-full rounded-xl bg-raise px-3 py-3 text-[17px] text-ivory focus:outline-none";
const Msg = ({ s }: { s: ActionState }) => (s ? <p className={`mt-2 text-[14px] ${s.ok ? "text-good" : "text-alert"}`}>{s.message ?? s.error}</p> : null);

export function RequirementToggle({ caseId, req }: { caseId: string; req: { id: string; label: string; source: string; received: boolean } }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => void (await plateRequirementAction(caseId, req.id, !req.received)))} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${req.received ? "bg-good text-ink" : "ring-1 ring-faint"}`}>{req.received ? "✓" : ""}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[16px] ${req.received ? "text-dim line-through" : "text-ivory"}`}>{req.label}</span>
        <span className="block text-[12px] text-faint">Fuente: {req.source}</span>
      </span>
    </button>
  );
}

export function PlateCaseForm({ c, statuses }: { c: { id: string; status: string; nextStep: string | null; notes: string | null; vin: string | null; dueDate: string | null }; statuses: Array<[string, string]> }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(plateCaseAction.bind(null, c.id), null);
  return (
    <form action={action} className="rounded-3xl bg-panel p-5">
      <label className="block text-[13px] text-dim">
        Estado
        <select name="status" key={c.status} defaultValue={c.status} className={field}>
          {statuses.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-[13px] text-dim">
        Siguiente paso
        <input name="nextStep" defaultValue={c.nextStep ?? ""} className={field} />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-[13px] text-dim">
          Fecha límite
          <input type="date" name="dueDate" defaultValue={c.dueDate ?? ""} className={field} />
        </label>
        <label className="text-[13px] text-dim">
          VIN
          <input name="vin" defaultValue={c.vin ?? ""} autoCapitalize="characters" className={field} />
        </label>
      </div>
      <label className="mt-3 block text-[13px] text-dim">
        Notas
        <textarea name="notes" rows={3} defaultValue={c.notes ?? ""} className={field} />
      </label>
      <button type="submit" disabled={pending} className="mt-4 min-h-12 w-full rounded-2xl bg-raise text-[16px] text-ivory">
        Guardar
      </button>
      <Msg s={state} />
    </form>
  );
}

export function DraftPlatesEmailButton({ customerId }: { customerId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => void (await draftPlatesEmailAction(customerId)))} className="min-h-12 w-full rounded-2xl bg-sand text-[16px] font-semibold text-ink">
      {pending ? "Preparando…" : "Preparar correo de placas"}
    </button>
  );
}

export function OpenPlateCaseButton({ customerId }: { customerId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => void (await openPlateCaseAction(customerId)))} className="min-h-12 w-full rounded-2xl bg-sand text-[16px] font-semibold text-ink">
      Abrir trámite de placas
    </button>
  );
}

export function RequirementsEditor({ reqs, recipient }: { reqs: Array<{ id: string; label: string; sourceLabel: string; isDemo: boolean }>; recipient: string | null }) {
  const [state, add, p1] = useActionState<ActionState, FormData>(addPlateRequirementAction, null);
  const [rState, saveRecipient, p2] = useActionState<ActionState, FormData>(platesRecipientAction, null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line">
        {reqs.map((r) => (
          <li key={r.id} className="flex min-h-12 items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] text-ivory">{r.label}</span>
              <span className="block text-[12px] text-faint">Fuente: {r.sourceLabel}</span>
            </span>
            <button type="button" disabled={pending} onClick={() => start(async () => void (await removePlateRequirementAction(r.id)))} className="text-[13px] text-dim">
              Quitar
            </button>
          </li>
        ))}
      </ul>
      <form action={add} className="grid gap-2">
        <input name="label" placeholder="Requisito (p. ej. factura original)" required className={field} />
        <input name="source" placeholder="Fuente (p. ej. indicación de Mario, oficio…)" required className={field} />
        <button type="submit" disabled={p1} className="min-h-11 rounded-2xl bg-raise text-[15px] text-ivory">
          Agregar requisito
        </button>
        <Msg s={state} />
      </form>
      <form action={saveRecipient} className="grid gap-2">
        <label className="text-[13px] text-dim">
          Correo del gestor/área de placas
          <input name="email" type="email" inputMode="email" defaultValue={recipient ?? ""} className={field} />
        </label>
        <button type="submit" disabled={p2} className="min-h-11 rounded-2xl bg-raise text-[15px] text-ivory">
          Guardar destinatario
        </button>
        <Msg s={rState} />
      </form>
    </div>
  );
}
