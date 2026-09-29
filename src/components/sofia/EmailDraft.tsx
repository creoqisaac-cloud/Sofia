"use client";

import { useActionState, useState, useTransition } from "react";
import { emailOpAction, updateEmailAction, type ActionState } from "@/app/actions";
import { shareFiles } from "./native";

export interface EmailView {
  id: string;
  to: string | null;
  subject: string;
  body: string;
  attachments: Array<{ documentId?: string; label: string }> | string[];
  status?: string;
  providerConfigured: boolean;
}

/**
 * Borrador de correo: previsualizar, editar, adjuntos propuestos.
 * [Enviar] pide confirmación y solo funciona con cuenta configurada; [Abrir en Mail] lo envía Mario.
 */
export function EmailDraft({ email, compact = false }: { email: EmailView; compact?: boolean }) {
  const [state, save, saving] = useActionState<ActionState, FormData>(updateEmailAction.bind(null, email.id), null);
  const [op, setOp] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [to, setTo] = useState(email.to ?? "");
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const status = email.status ?? "draft";
  const attachments = (email.attachments as Array<{ label: string; documentId?: string } | string>).map((a) => (typeof a === "string" ? { label: a } : a));
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const doOp = (o: "send" | "cancel" | "opened" | "mark_sent") => start(async () => setOp(await emailOpAction(email.id, o)));
  const share = async () => {
    try {
      const files = attachments.filter((a) => a.documentId).map((a) => ({ url: `/api/documents/${a.documentId}/file`, name: a.label }));
      await shareFiles(files, { title: subject, text: `${to ? `Para: ${to}\n\n` : ""}${body}` });
    } catch (e) {
      if (!/cancel/i.test((e as Error).message)) setOp({ ok: false, error: (e as Error).message });
    }
  };

  if (status !== "draft" && status !== "opened_in_mail" && !op?.ok) {
    return <div className="rounded-3xl bg-panel p-5 text-[15px] text-dim">Correo {status === "sent" ? "enviado" : status === "cancelled" ? "cancelado" : status}.</div>;
  }
  return (
    <form action={save} className="rounded-3xl bg-panel p-5">
      <div className="text-[13px] text-dim">Borrador · no se envía sin tu confirmación</div>
      <label className="mt-3 block text-[13px] text-faint">
        Para
        <input name="to" type="email" inputMode="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="correo del gestor de placas" className="mt-1 w-full rounded-xl bg-raise px-3 py-2.5 text-ivory placeholder:text-faint focus:outline-none" />
      </label>
      <label className="mt-3 block text-[13px] text-faint">
        Asunto
        <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-xl bg-raise px-3 py-2.5 text-ivory focus:outline-none" />
      </label>
      <label className="mt-3 block text-[13px] text-faint">
        Mensaje
        <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={compact ? 8 : 14} className="mt-1 w-full rounded-xl bg-raise px-3 py-2.5 leading-relaxed text-ivory focus:outline-none" />
      </label>
      <div className="mt-3 text-[13px] text-faint">
        Adjuntos propuestos: {attachments.length ? attachments.map((a) => a.label).join(", ") : "ninguno (no hay documentos aceptados del cliente)"}
      </div>

      {(state?.message || state?.error) && <p className={`mt-3 text-[14px] ${state.ok ? "text-good" : "text-alert"}`}>{state.message ?? state.error}</p>}
      {(op?.message || op?.error) && <p className={`mt-3 text-[14px] ${op.ok ? "text-good" : "text-alert"}`}>{op.message ?? op.error}</p>}
      {!email.providerConfigured && <p className="mt-3 text-[13px] text-dim">Envío desde Sofía: falta configurar la cuenta de correo. Puedes abrirlo en Mail y enviarlo tú.</p>}

      {confirming ? (
        <div className="mt-4 rounded-2xl bg-raise p-4">
          <p className="text-[15px] text-ivory">¿Enviar este correo a {to || "(sin destinatario)"}?</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={pending} onClick={() => { setConfirming(false); doOp("send"); }} className="min-h-12 rounded-2xl bg-sand font-semibold text-ink">
              Sí, enviar
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="min-h-12 rounded-2xl bg-panel text-ivory">
              No
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setConfirming(true)} className="min-h-12 rounded-2xl bg-sand text-[15px] font-semibold text-ink">
            Enviar
          </button>
          <a href={mailto} onClick={() => doOp("opened")} className="flex min-h-12 items-center justify-center rounded-2xl bg-raise text-[15px] text-ivory">
            Abrir correo
          </a>
          <button type="button" onClick={share} className="min-h-12 rounded-2xl bg-raise text-[15px] text-ivory">
            Compartir con adjuntos
          </button>
          <button type="button" disabled={pending} onClick={() => doOp("mark_sent")} className="min-h-12 rounded-2xl bg-raise text-[15px] text-ivory">
            Marcar enviado
          </button>
          <button type="submit" disabled={saving} className="min-h-12 rounded-2xl bg-raise text-[15px] text-ivory">
            Guardar cambios
          </button>
          <button type="button" disabled={pending} onClick={() => doOp("cancel")} className="min-h-12 rounded-2xl bg-raise text-[15px] text-dim">
            Cancelar
          </button>
        </div>
      )}
    </form>
  );
}
