"use client";

/** Componentes del modo tablet: documentos, revisión de datos, PDF (ver/compartir/guardar), cotización de Mario, seguimiento. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import {
  captureFromDocAction,
  contactedAction,
  customerNumberAction,
  followupOpAction,
  inboxStatusAction,
  registerMarioQuoteAction,
  reviewDocFactAction,
  type ActionState,
} from "@/app/actions";
import { IconPhone, IconShare, IconUpload } from "./icons";
import { openFile, saveFile, shareFiles } from "./native";

const field = "mt-1 w-full rounded-xl bg-raise px-3 py-3 text-[17px] text-ivory focus:outline-none";
const big = "flex min-h-14 items-center justify-center gap-2 rounded-2xl px-4 text-[16px]";
const Msg = ({ s }: { s: ActionState | { ok: boolean; message?: string; error?: string } | null }) =>
  s ? <p className={`mt-2 text-[14px] ${s.ok ? "text-good" : "text-alert"}`}>{s.message ?? s.error}</p> : null;

// ───────── Subir documentos ─────────

export function DocumentUploader({ customerId, docTypes }: { customerId: string; docTypes: Array<[string, string]> }) {
  const router = useRouter();
  const [docType, setDocType] = useState("other");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const files = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("docType", docType);
    for (const f of Array.from(list)) fd.append("file", f);
    try {
      const r = await fetch(`/api/customers/${customerId}/documents`, { method: "POST", body: fd });
      const j = (await r.json()) as { results?: Array<{ ok: boolean; error?: string }>; error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo subir.");
      const bad = (j.results ?? []).filter((x) => !x.ok);
      const good = (j.results ?? []).length - bad.length;
      setMsg(bad.length ? { ok: good > 0, error: `${good} subido(s). ${bad.map((b) => b.error).join(" ")}` } : { ok: true, message: `${good} documento(s) subido(s) y leído(s).` });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, error: (e as Error).message });
    } finally {
      setBusy(false);
      if (files.current) files.current.value = "";
      if (camera.current) camera.current.value = "";
    }
  }

  return (
    <div className="rounded-3xl bg-panel p-5">
      <label className="block text-[13px] text-dim">
        ¿Qué documento es?
        <select value={docType} onChange={(e) => setDocType(e.target.value)} className={field}>
          {docTypes.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <input ref={files} type="file" accept="application/pdf,image/jpeg,image/png" multiple hidden onChange={(e) => upload(e.target.files)} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => upload(e.target.files)} />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => files.current?.click()} className={`${big} bg-sand font-semibold text-ink`}>
          <IconUpload /> {busy ? "Subiendo…" : "Elegir archivos"}
        </button>
        <button type="button" disabled={busy} onClick={() => camera.current?.click()} className={`${big} bg-raise text-ivory`}>
          Tomar foto
        </button>
      </div>
      <p className="mt-2 text-[12px] text-faint">PDF, JPG o PNG · máx. 15 MB · se guardan en privado en el servidor de Sofía.</p>
      <Msg s={msg} />
    </div>
  );
}

// ───────── Revisión de datos leídos ─────────

export function FactReviewRow({ customerId, documentId, f }: { customerId: string; documentId: string; f: { id: string; label: string; value: string; status: string; confidence: string; sourceLabel: string | null } }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(f.value);
  const [res, setRes] = useState<ActionState>(null);
  const act = (a: "confirm" | "ignore" | "correct") => start(async () => setRes(await reviewDocFactAction(customerId, documentId, f.id, a, a === "correct" ? value : undefined)));
  const open = f.status === "observed" || f.status === "conflicting";
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] text-dim">{f.label}</span>
        <span className={`text-[12px] ${f.status === "conflicting" ? "text-alert" : f.status === "confirmed" ? "text-good" : "text-faint"}`}>
          {f.status === "conflicting" ? "No coincide con otro dato" : f.status === "confirmed" ? "Confirmado" : f.status === "superseded" ? "Ignorado / reemplazado" : `Leído · confianza ${f.confidence === "high" ? "alta" : f.confidence === "low" ? "baja" : "media"}`}
        </span>
      </div>
      <div className="text-[18px] text-ivory">{f.value}</div>
      {open && !res?.ok && (
        <>
          {editing ? (
            <div className="mt-2 flex gap-2">
              <input value={value} onChange={(e) => setValue(e.target.value)} className={`${field} mt-0`} autoFocus />
              <button type="button" disabled={pending} onClick={() => act("correct")} className="min-h-12 rounded-xl bg-sand px-4 font-semibold text-ink">
                Guardar
              </button>
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button type="button" disabled={pending} onClick={() => act("confirm")} className="min-h-12 rounded-xl bg-sand font-semibold text-ink">
                Confirmar
              </button>
              <button type="button" disabled={pending} onClick={() => setEditing(true)} className="min-h-12 rounded-xl bg-raise text-ivory">
                Corregir
              </button>
              <button type="button" disabled={pending} onClick={() => act("ignore")} className="min-h-12 rounded-xl bg-raise text-dim">
                Ignorar
              </button>
            </div>
          )}
        </>
      )}
      <Msg s={res} />
    </li>
  );
}

export function DocCaptureForm({ customerId, documentId, keys }: { customerId: string; documentId: string; keys: Array<[string, string]> }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(captureFromDocAction.bind(null, customerId, documentId), null);
  return (
    <form action={action} className="rounded-3xl bg-panel p-5">
      <div className="text-[15px] text-ivory">Capturar un dato de este documento</div>
      <p className="text-[13px] text-dim">Lo que escribes tú queda confirmado y ligado a este documento.</p>
      <label className="mt-3 block text-[13px] text-dim">
        Dato
        <select name="key" className={field}>
          {keys.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-[13px] text-dim">
        Valor
        <input name="value" required className={field} autoComplete="off" />
      </label>
      <button type="submit" disabled={pending} className="mt-4 min-h-12 w-full rounded-2xl bg-raise text-[16px] text-ivory">
        Guardar dato
      </button>
      <Msg s={state} />
    </form>
  );
}

export function DocStatusButtons({ customerId, documentId }: { customerId: string; documentId: string }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionState>(null);
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={pending} onClick={() => start(async () => setRes(await inboxStatusAction(customerId, documentId, "confirmed")))} className={`${big} bg-raise text-ivory`}>
          Documento revisado
        </button>
        <button type="button" disabled={pending} onClick={() => start(async () => setRes(await inboxStatusAction(customerId, documentId, "rejected")))} className={`${big} bg-raise text-dim`}>
          Rechazar
        </button>
      </div>
      <Msg s={res} />
    </div>
  );
}

// ───────── PDF: ver / compartir / guardar ─────────

export function PdfActions({ url, name, title, text }: { url: string; name: string; title?: string; text?: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const wrap = (fn: () => Promise<unknown>) => async () => {
    setMsg(null);
    try {
      const r = await fn();
      if (typeof r === "string" && r.startsWith("Guardado")) setMsg({ ok: true, message: r });
    } catch (e) {
      const m = (e as Error).message;
      if (!/cancel/i.test(m)) setMsg({ ok: false, error: m || "No se pudo." });
    }
  };
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={wrap(() => openFile(url, name))} className={`${big} bg-raise text-ivory`}>
          Ver PDF
        </button>
        <button type="button" onClick={wrap(() => shareFiles([{ url, name }], { title, text }))} className={`${big} bg-sand font-semibold text-ink`}>
          <IconShare width={18} height={18} /> Compartir
        </button>
        <button type="button" onClick={wrap(() => saveFile(url, name))} className={`${big} bg-raise text-ivory`}>
          Guardar
        </button>
      </div>
      <Msg s={msg} />
    </div>
  );
}

// ───────── Cotización enviada por Mario ─────────

export function MarioQuoteForm({ customerId, models }: { customerId: string; models: Array<{ model: string; versions: string[] }> }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registerMarioQuoteAction.bind(null, customerId), null);
  const [model, setModel] = useState(models[0]?.model ?? "");
  const versions = models.find((m) => m.model === model)?.versions ?? [];
  return (
    <form action={action} className="rounded-3xl bg-panel p-5">
      <div className="text-[15px] text-ivory">Registrar la cotización que enviaste</div>
      <p className="text-[13px] text-dim">Sofía no cotiza: solo guarda lo que tú mandaste para darle seguimiento.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-[13px] text-dim">
          Modelo
          <select name="model" value={model} onChange={(e) => setModel(e.target.value)} className={field}>
            {models.map((m) => (
              <option key={m.model}>{m.model}</option>
            ))}
          </select>
        </label>
        <label className="text-[13px] text-dim">
          Versión
          <select name="version" className={field}>
            <option value="">—</option>
            {versions.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-[13px] text-dim">
          Enganche
          <input name="downPayment" inputMode="decimal" required className={field} />
        </label>
        <label className="text-[13px] text-dim">
          Plazo (meses)
          <input name="termMonths" inputMode="numeric" className={field} />
        </label>
        <label className="text-[13px] text-dim">
          Mensualidad
          <input name="monthlyPayment" inputMode="decimal" className={field} />
        </label>
        <label className="text-[13px] text-dim">
          Precio
          <input name="vehiclePrice" inputMode="decimal" className={field} />
        </label>
      </div>
      <button type="submit" disabled={pending} className="mt-4 min-h-12 w-full rounded-2xl bg-sand text-[16px] font-semibold text-ink">
        Guardar cotización
      </button>
      <Msg s={state} />
    </form>
  );
}

export function CustomerNumberForm({ customerId, value }: { customerId: string; value: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(customerNumberAction.bind(null, customerId), null);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[16px] text-dim underline-offset-4 hover:underline">
        {value ? `# ${value}` : "+ Agregar # de cliente"}
      </button>
    );
  return (
    <form action={action} className="flex items-center gap-2">
      <span className="text-dim">#</span>
      <input name="customerNumber" defaultValue={value ?? ""} autoFocus className="w-44 rounded-xl bg-raise px-3 py-2 text-[17px] text-ivory focus:outline-none" />
      <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-raise px-4 text-ivory">
        Guardar
      </button>
      <Msg s={state} />
    </form>
  );
}

// ───────── Seguimiento: acciones grandes ─────────

export function FollowupButtons({ customerId, followupId, phone }: { customerId: string; followupId: string | null; phone: string | null }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionState>(null);
  const run = (fn: () => Promise<ActionState>) => start(async () => setRes(await fn()));
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {phone ? (
          <a href={`tel:${phone}`} onClick={() => run(() => contactedAction(customerId, null))} className={`${big} bg-sand font-semibold text-ink`}>
            <IconPhone width={18} height={18} /> Contactar
          </a>
        ) : (
          <button type="button" disabled={pending} onClick={() => run(() => contactedAction(customerId, null))} className={`${big} bg-sand font-semibold text-ink`}>
            Ya lo contacté
          </button>
        )}
        <Link href={`/agenda?new=${customerId}`} className={`${big} bg-raise text-ivory`}>
          Agendar cita
        </Link>
        {followupId && (
          <>
            <button type="button" disabled={pending} onClick={() => run(() => followupOpAction(followupId, "postpone"))} className={`${big} bg-raise text-ivory`}>
              Posponer
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => followupOpAction(followupId, "done"))} className={`${big} bg-raise text-ivory`}>
              Completado
            </button>
          </>
        )}
      </div>
      <Msg s={res} />
    </div>
  );
}
