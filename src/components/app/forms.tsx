"use client";

/**
 * Formularios táctiles de la app operativa. Entradas especializadas:
 * dinero (teclado decimal), teléfono (tel), correo (email), fecha (date),
 * numéricos (numeric). Todas a 16 px para evitar el zoom automático de iOS.
 */
import { useActionState, useState, useTransition, type ReactNode } from "react";
import {
  alertStatusAction,
  approvalDecisionAction,
  attachQuoteAction,
  confirmFactAction,
  confirmFactsAction,
  createApplicationAction,
  createCustomerAction,
  createSaleAction,
  generatePdfAction,
  importApplicationAction,
  lookupScenarioAction,
  registerScenarioAction,
  resolveConflictAction,
  saveProfileSectionAction,
  setApplicationStatusAction,
  setDocumentStatusAction,
  setSaleStatusAction,
  updateSaleSectionAction,
  type ActionState,
} from "@/app/actions";
import type { ProfileSection } from "@/domain/profile-fields";
import type { SaleSection } from "@/domain/sales";
import { buttonClass, fmtMoney, Pill } from "./ui";

const INPUT = "block w-full min-h-12 rounded-xl border border-zinc-700 bg-ink px-3 text-base text-ivory placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  return <p className={`text-sm ${state.ok ? "text-sand" : "text-rose-400"}`}>{state.ok ? (state.message ?? "Listo") : state.error}</p>;
}

function Label({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
        {label}
        {hint}
      </span>
      {children}
    </label>
  );
}

export function MoneyInput({ name, defaultValue, label }: { name: string; defaultValue?: number | string | null; label: string }) {
  return (
    <Label label={label}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">$</span>
        <input name={name} inputMode="decimal" autoComplete="off" defaultValue={defaultValue ?? ""} className={`${INPUT} pl-7`} placeholder="0" />
      </div>
    </Label>
  );
}

export function PhoneInput({ name, defaultValue, label }: { name: string; defaultValue?: string | null; label: string }) {
  return (
    <Label label={label}>
      <input name={name} type="tel" inputMode="tel" autoComplete="tel" defaultValue={defaultValue ?? ""} className={INPUT} placeholder="10 dígitos" />
    </Label>
  );
}

export interface EditableField {
  key: string;
  label: string;
  kind: string;
  inputMode?: string;
  enumOptions?: Array<{ value: string; label: string }>;
  value: string | number | null;
  status: "confirmed" | "observed" | "conflicting" | "missing";
  sourceLabel: string | null;
}

const STATUS_HINT: Record<EditableField["status"], ReactNode> = {
  confirmed: <Pill tone="green">✓ confirmado</Pill>,
  observed: <Pill tone="amber">por confirmar</Pill>,
  conflicting: <Pill tone="red">⚠ conflicto</Pill>,
  missing: null,
};

function FieldInput({ f }: { f: EditableField }) {
  const hint = STATUS_HINT[f.status];
  const value = f.value ?? "";
  if (f.kind === "money") return <MoneyInput name={f.key} label={f.label} defaultValue={value} />;
  if (f.kind === "phone") return <Label label={f.label} hint={hint}><input name={f.key} type="tel" inputMode="tel" defaultValue={value} className={INPUT} placeholder="10 dígitos" /></Label>;
  if (f.kind === "email") return <Label label={f.label} hint={hint}><input name={f.key} type="email" inputMode="email" autoCapitalize="none" defaultValue={value} className={INPUT} /></Label>;
  if (f.kind === "date") return <Label label={f.label} hint={hint}><input name={f.key} type="date" defaultValue={value} className={INPUT} /></Label>;
  if (f.kind === "enum")
    return (
      <Label label={f.label} hint={hint}>
        <select name={f.key} defaultValue={String(value)} className={INPUT}>
          <option value="">—</option>
          {f.enumOptions?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Label>
    );
  if (f.kind === "number") return <Label label={f.label} hint={hint}><input name={f.key} inputMode="numeric" pattern="[0-9]*" defaultValue={value} className={INPUT} /></Label>;
  return (
    <Label label={f.label} hint={hint}>
      <input name={f.key} inputMode={(f.inputMode as "text") ?? "text"} autoCapitalize={f.inputMode === "numeric" ? "none" : "words"} defaultValue={value} className={INPUT} />
    </Label>
  );
}

/** Captura por sección (nunca un formulario interminable). Guardar = Mario confirma. */
export function ProfileSectionForm({ customerId, section, fields, submitLabel = "Guardar" }: { customerId: string; section: ProfileSection; fields: EditableField[]; submitLabel?: string }) {
  const [state, action, pending] = useActionState(saveProfileSectionAction.bind(null, customerId, section), null);
  const editable = fields.filter((f) => f.status !== "conflicting");
  return (
    <form action={action} className="space-y-3">
      {editable.map((f) => (
        <FieldInput key={f.key} f={f} />
      ))}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex items-center gap-3 bg-zinc-900/95 py-2 lg:bottom-0">
        <button type="submit" disabled={pending} className={buttonClass("primary", true)}>
          {pending ? "Guardando…" : submitLabel}
        </button>
      </div>
      <FormMessage state={state} />
      <p className="text-xs text-faint">Al guardar, Mario confirma estos datos (quedan con fuente “Captura de Mario”, usuario y fecha).</p>
    </form>
  );
}

/** Alias semántico para la sección de domicilio. */
export function AddressEditor(props: { customerId: string; fields: EditableField[] }) {
  return <ProfileSectionForm customerId={props.customerId} section="address" fields={props.fields} submitLabel="Guardar domicilio" />;
}

export function ConfirmFactButton({ customerId, factId }: { customerId: string; factId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => void (await confirmFactAction(customerId, factId)))} className={`${buttonClass("secondary")} min-h-9 px-3 text-sm`}>
      {pending ? "…" : "Confirmar"}
    </button>
  );
}

export function ConfirmAllButton({ customerId, factIds, label }: { customerId: string; factIds: string[]; label: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div className="space-y-1">
      <button type="button" disabled={pending || !factIds.length} onClick={() => start(async () => setState(await confirmFactsAction(customerId, factIds)))} className={buttonClass("secondary", true)}>
        {pending ? "Confirmando…" : label}
      </button>
      <FormMessage state={state} />
    </div>
  );
}

export function ConflictCard({ customerId, fieldKey, label, candidates }: { customerId: string; fieldKey: string; label: string; candidates: Array<{ factId: string; display: string; sourceLabel: string | null }> }) {
  const [pending, start] = useTransition();
  const [manual, setManual] = useState<string | null>(null);
  const [state, setState] = useState<ActionState>(null);
  const choose = (choice: { factId?: string; manualValue?: string }) => start(async () => setState(await resolveConflictAction(customerId, fieldKey, choice)));
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
      <p className="text-sm font-semibold text-amber-300">⚠️ Conflicto de información · {label}</p>
      <ul className="mt-3 space-y-2">
        {candidates.map((c) => (
          <li key={c.factId} className="flex flex-col gap-2 rounded-xl bg-ink/60 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs text-zinc-400">{c.sourceLabel ?? "Sin fuente"}</div>
              <div className="break-words font-mono text-base font-medium text-ivory">{c.display}</div>
            </div>
            <button type="button" disabled={pending} onClick={() => choose({ factId: c.factId })} className={`${buttonClass("secondary")} shrink-0 px-3 text-sm`}>
              Usar {c.sourceLabel?.replace(/^Solicitud /, "").replace(/ \(.*\)$/, "") ?? "este"}
            </button>
          </li>
        ))}
      </ul>
      {manual === null ? (
        <button type="button" onClick={() => setManual("")} className={`${buttonClass("ghost")} mt-2 px-2 text-sm`}>
          Capturar otro
        </button>
      ) : (
        <div className="mt-3 flex gap-2">
          <input value={manual} onChange={(e) => setManual(e.target.value)} className={INPUT} placeholder="Valor correcto" />
          <button type="button" disabled={pending || !manual.trim()} onClick={() => choose({ manualValue: manual })} className={buttonClass("primary")}>
            Usar
          </button>
        </div>
      )}
      <p className="mt-2 text-xs text-zinc-400">Nada se borra: el valor elegido queda confirmado y los demás como históricos, con auditoría.</p>
      <FormMessage state={state} />
    </div>
  );
}

const DOC_OPTIONS = [
  ["missing", "Falta"],
  ["received", "Recibido"],
  ["needs_review", "Por revisar"],
  ["accepted", "Aceptado"],
  ["rejected", "Rechazado"],
] as const;
type DocStatus = "missing" | "requested" | "received" | "needs_review" | "accepted" | "rejected";

export function DocumentChecklist({ customerId, items }: { customerId: string; items: Array<{ docType: string; label: string; status: DocStatus; requiredBy: Array<{ institution: string; isDemo: boolean }> }> }) {
  const [pending, start] = useTransition();
  return (
    <ul className="divide-y divide-zinc-800">
      {items.map((d) => (
        <li key={d.docType} className="flex items-center gap-3 py-3">
          <span className={`text-lg ${d.status === "accepted" ? "text-sand" : "text-zinc-600"}`}>{d.status === "accepted" ? "✓" : "○"}</span>
          <div className="min-w-0 flex-1">
            <div className="text-base text-zinc-100">{d.label}</div>
            {d.requiredBy.length > 0 && (
              <div className="text-xs text-faint">
                Requerido por {d.requiredBy.map((r) => r.institution).join(", ")}
                {d.requiredBy.some((r) => r.isDemo) ? " (regla DEMO)" : ""}
              </div>
            )}
          </div>
          <select
            aria-label={`Estado de ${d.label}`}
            disabled={pending}
            defaultValue={d.status === "requested" ? "missing" : d.status}
            onChange={(e) => start(async () => void (await setDocumentStatusAction(customerId, d.docType, e.target.value)))}
            className="min-h-11 rounded-xl border border-zinc-700 bg-ink px-2 text-base text-zinc-100"
          >
            {DOC_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </li>
      ))}
    </ul>
  );
}

export function CreateCustomerForm() {
  const [state, action, pending] = useActionState(createCustomerAction, null);
  return (
    <form action={action} className="space-y-3">
      <Label label="Nombre del cliente">
        <input name="displayName" required autoCapitalize="words" className={INPUT} placeholder="Nombre y apellido" />
      </Label>
      <PhoneInput name="phone" label="Celular (opcional)" />
      <button className={buttonClass("primary", true)} disabled={pending}>
        {pending ? "Creando…" : "Crear cliente"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

export function NewApplicationButtons({ customerId, institutions }: { customerId: string; institutions: Array<{ code: string; name: string }> }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        {institutions.map((i) => (
          <button key={i.code} disabled={pending} onClick={() => start(async () => setState(await createApplicationAction(customerId, i.code)))} className={`${buttonClass("secondary")} min-h-16 text-lg`}>
            {i.name}
          </button>
        ))}
      </div>
      <FormMessage state={state} />
    </div>
  );
}

export function ApplicationStatusForm({ customerId, applicationId, options }: { customerId: string; applicationId: string; options: Array<{ value: string; label: string }> }) {
  const [state, action, pending] = useActionState(setApplicationStatusAction.bind(null, customerId, applicationId), null);
  if (!options.length) return null;
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <select key={options.map((o) => o.value).join()} name="status" className={INPUT}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button className={buttonClass("secondary")} disabled={pending}>
          Cambiar
        </button>
      </div>
      <input name="reason" className={INPUT} placeholder="Motivo / nota (opcional)" />
      <FormMessage state={state} />
    </form>
  );
}

export function GeneratePdfButton({ customerId, applicationId, blocked }: { customerId: string; applicationId: string; blocked: string | null }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const docId = (state?.data as { documentId?: string } | undefined)?.documentId;
  return (
    <div className="space-y-2">
      <button disabled={pending} onClick={() => start(async () => setState(await generatePdfAction(customerId, applicationId)))} className={buttonClass("primary", true)}>
        {pending ? "Generando…" : "Generar borrador PDF"}
      </button>
      {blocked && <p className="text-xs text-amber-300">{blocked}</p>}
      <FormMessage state={state} />
      {docId && (
        <a href={`/api/documents/generated/${docId}`} className={buttonClass("secondary", true)} target="_blank" rel="noreferrer">
          Abrir borrador PDF
        </a>
      )}
    </div>
  );
}

export function ImportApplicationForm({ customerId, institutions }: { customerId: string; institutions: Array<{ code: string; name: string }> }) {
  const [state, action, pending] = useActionState(importApplicationAction.bind(null, customerId), null);
  return (
    <form action={action} className="space-y-3">
      <select name="institution" className={INPUT}>
        {institutions.map((i) => (
          <option key={i.code} value={i.code}>
            Solicitud {i.name}
          </option>
        ))}
      </select>
      <input name="file" type="file" accept="application/pdf" className="block w-full text-sm text-zinc-300 file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-zinc-800 file:px-4 file:text-zinc-100" />
      <button className={buttonClass("secondary", true)} disabled={pending}>
        {pending ? "Leyendo…" : "Leer solicitud previa"}
      </button>
      <FormMessage state={state} />
      <p className="text-xs text-faint">Solo lee campos AcroForm (sin OCR). Los datos distintos a los existentes quedan como conflicto para que tú decidas.</p>
    </form>
  );
}

type Lookup = {
  model: string;
  version: string;
  validated: { id: string; name: string; monthlyPayment: number; bonus: number; downPayment: number; termMonths: number; isDemo: boolean } | null;
  message: string | null;
  estimate: { monthlyPayment: number | null; bonus: number } | null;
};

export function ScenarioLookupForm({ customerId, vehicles }: { customerId: string; vehicles: Array<{ model: string; versions: string[] }> }) {
  const [state, action, pending] = useActionState(lookupScenarioAction, null);
  const [model, setModel] = useState(vehicles[0]?.model ?? "");
  const [attach, startAttach] = useTransition();
  const [attached, setAttached] = useState<ActionState>(null);
  const data = state?.ok ? (state.data as Lookup) : null;
  return (
    <div className="space-y-3">
      <form action={action} className="grid grid-cols-2 gap-3">
        <Label label="Modelo">
          <select name="model" value={model} onChange={(e) => setModel(e.target.value)} className={INPUT}>
            {vehicles.map((v) => (
              <option key={v.model}>{v.model}</option>
            ))}
          </select>
        </Label>
        <Label label="Versión">
          <select name="version" className={INPUT}>
            {vehicles.find((v) => v.model === model)?.versions.map((v) => <option key={v}>{v}</option>)}
          </select>
        </Label>
        <MoneyInput name="downPayment" label="Enganche" />
        <Label label="Plazo (meses)">
          <input name="termMonths" inputMode="numeric" defaultValue="48" className={INPUT} />
        </Label>
        <button className={`${buttonClass("secondary", true)} col-span-2`} disabled={pending}>
          Buscar corrida validada
        </button>
      </form>
      <FormMessage state={state && !state.ok ? state : null} />
      {data && (
        <div className="rounded-xl border border-zinc-800 p-3 text-sm">
          {data.validated ? (
            <>
              <p className="text-emerald-300">✓ Corrida validada: {data.validated.name}</p>
              <p className="mt-1 text-zinc-300">
                Mensualidad {fmtMoney(data.validated.monthlyPayment)} · bono {fmtMoney(data.validated.bonus)} {data.validated.isDemo && <Pill tone="violet">DEMO</Pill>}
              </p>
              <button disabled={attach} onClick={() => startAttach(async () => setAttached(await attachQuoteAction(customerId, data.validated!.id)))} className={`${buttonClass("primary", true)} mt-3`}>
                Guardar en el cliente
              </button>
              <FormMessage state={attached} />
            </>
          ) : (
            <>
              <p className="text-amber-300">{data.message}</p>
              {data.estimate?.monthlyPayment && (
                <p className="mt-1 text-zinc-400">
                  Referencia: estimación del motor ≈ {fmtMoney(Math.round(data.estimate.monthlyPayment))}/mes (NO es corrida validada).
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function RegisterScenarioForm({ vehicles }: { vehicles: Array<{ model: string; versions: string[] }> }) {
  const [state, action, pending] = useActionState(registerScenarioAction, null);
  const [model, setModel] = useState(vehicles[0]?.model ?? "");
  return (
    <form action={action} className="grid grid-cols-2 gap-3">
      <Label label="Modelo">
        <select name="model" value={model} onChange={(e) => setModel(e.target.value)} className={INPUT}>
          {vehicles.map((v) => (
            <option key={v.model}>{v.model}</option>
          ))}
        </select>
      </Label>
      <Label label="Versión">
        <select name="version" className={INPUT}>
          {vehicles.find((v) => v.model === model)?.versions.map((v) => <option key={v}>{v}</option>)}
        </select>
      </Label>
      <MoneyInput name="vehiclePrice" label="Precio" />
      <MoneyInput name="bonus" label="Bono" />
      <MoneyInput name="downPayment" label="Enganche" />
      <Label label="Plazo (meses)">
        <input name="termMonths" inputMode="numeric" className={INPUT} />
      </Label>
      <MoneyInput name="monthlyPayment" label="Mensualidad" />
      <Label label="Vigente hasta">
        <input name="validTo" type="date" className={INPUT} />
      </Label>
      <button className={`${buttonClass("secondary", true)} col-span-2`} disabled={pending}>
        Guardar corrida validada
      </button>
      <div className="col-span-2">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function CreateSaleButton({ customerId, quoteId = null, creditApplicationId = null, label = "Crear venta" }: { customerId: string; quoteId?: string | null; creditApplicationId?: string | null; label?: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <>
      <button disabled={pending} onClick={() => start(async () => setState(await createSaleAction(customerId, quoteId, creditApplicationId)))} className={buttonClass("primary", true)}>
        {pending ? "Creando…" : label}
      </button>
      <FormMessage state={state} />
    </>
  );
}

export interface SaleFieldValue {
  key: string;
  label: string;
  type: string;
  value: string | number | null;
}

export function SaleSectionForm({ saleId, section, fields }: { saleId: string; section: SaleSection; fields: SaleFieldValue[] }) {
  const [state, action, pending] = useActionState(updateSaleSectionAction.bind(null, saleId, section), null);
  return (
    <form action={action} className="space-y-3">
      {fields.map((f) =>
        f.type === "money" ? (
          <MoneyInput key={f.key} name={f.key} label={f.label} defaultValue={f.value} />
        ) : f.type === "date" ? (
          <Label key={f.key} label={f.label}>
            <input name={f.key} type="date" defaultValue={f.value ?? ""} className={INPUT} />
          </Label>
        ) : f.type === "int" ? (
          <Label key={f.key} label={f.label}>
            <input name={f.key} inputMode="numeric" defaultValue={f.value ?? ""} className={INPUT} />
          </Label>
        ) : f.type === "longtext" ? (
          <Label key={f.key} label={f.label}>
            <textarea name={f.key} rows={3} defaultValue={f.value ?? ""} className={`${INPUT} py-2`} />
          </Label>
        ) : (
          <Label key={f.key} label={f.label}>
            <input name={f.key} defaultValue={f.value ?? ""} className={INPUT} />
          </Label>
        ),
      )}
      <input name="reason" className={INPUT} placeholder="Motivo del cambio (se guarda en el historial)" />
      <button className={buttonClass("primary", true)} disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

export function SaleStatusForm({ saleId, current, options }: { saleId: string; current: string; options: Array<{ value: string; label: string }> }) {
  const [state, action, pending] = useActionState(setSaleStatusAction.bind(null, saleId), null);
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <select key={current} name="status" defaultValue={current} className={INPUT}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button className={buttonClass("secondary")} disabled={pending}>
          Cambiar
        </button>
      </div>
      <input name="reason" className={INPUT} placeholder="Motivo (obligatorio para cancelar o reabrir)" />
      <FormMessage state={state} />
    </form>
  );
}

export function AlertActions({ alertId, status }: { alertId: string; status: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      {status === "open" && (
        <button disabled={pending} onClick={() => start(async () => void (await alertStatusAction(alertId, "acknowledged")))} className={`${buttonClass("secondary")} px-3 text-sm`}>
          Enterado
        </button>
      )}
      <button disabled={pending} onClick={() => start(async () => void (await alertStatusAction(alertId, "resolved")))} className={`${buttonClass("ghost")} px-3 text-sm`}>
        Resolver
      </button>
    </div>
  );
}

export function ApprovalActions({ approvalId }: { approvalId: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <button disabled={pending} onClick={() => start(async () => void (await approvalDecisionAction(approvalId, "approved")))} className={`${buttonClass("primary")} px-3 text-sm`}>
        Aprobar
      </button>
      <button disabled={pending} onClick={() => start(async () => void (await approvalDecisionAction(approvalId, "rejected")))} className={`${buttonClass("danger")} px-3 text-sm`}>
        Rechazar
      </button>
    </div>
  );
}
