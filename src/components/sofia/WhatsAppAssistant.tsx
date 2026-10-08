"use client";

import { useMemo, useState } from "react";

type Template = { id: string; label: string; text: (name: string) => string };
const TEMPLATES: Template[] = [
  { id: "seguimiento", label: "Seguimiento", text: (n) => `Hola${n ? ` ${n}` : ""}, soy Mario Abarca de Honda Valle Oriente. Te escribo para dar seguimiento a tu interés en Honda. ¿Hay algo en lo que pueda ayudarte?` },
  { id: "cita", label: "Confirmar cita", text: (n) => `Hola${n ? ` ${n}` : ""}, soy Mario de Honda Valle Oriente. ¿Me confirmas si seguimos con nuestra cita? Gracias.` },
  { id: "documentos", label: "Solicitar documentos", text: (n) => `Hola${n ? ` ${n}` : ""}, soy Mario de Honda Valle Oriente. Para continuar con tu trámite, ¿podemos revisar cuáles documentos faltan? Por seguridad, evita enviarme fotos de tu INE por este medio sin confirmar antes el canal autorizado.` },
  { id: "placas", label: "Estado de placas", text: (n) => `Hola${n ? ` ${n}` : ""}, soy Mario de Honda Valle Oriente. Estoy dando seguimiento a tu trámite de placas y te compartiré la información confirmada en cuanto esté disponible.` },
  { id: "entrega", label: "Entrega", text: (n) => `Hola${n ? ` ${n}` : ""}, soy Mario de Honda Valle Oriente. Quisiera coordinar los detalles de la entrega de tu vehículo. ¿Qué horario te acomoda?` },
];

function whatsappDigits(value: string): string | null {
  const raw = value.replace(/\D/g, "");
  const n = raw.length === 10 ? `52${raw}` : raw;
  return /^\d{11,15}$/.test(n) ? n : null;
}

export function WhatsAppAssistant({ initialName = "", initialPhone = "" }: { initialName?: string; initialPhone?: string }) {
  const [name, setName] = useState(initialName.replace(/\s*\(DEMO\)\s*/g, "").trim());
  const [phone, setPhone] = useState(initialPhone);
  const [template, setTemplate] = useState("seguimiento");
  const [message, setMessage] = useState(TEMPLATES[0]!.text(name));
  const [error, setError] = useState("");
  const digits = useMemo(() => whatsappDigits(phone), [phone]);

  function choose(id: string) {
    const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0]!;
    setTemplate(id);
    setMessage(t.text(name));
    setError("");
  }

  function openWhatsApp() {
    if (!digits) { setError("Escribe un número válido con lada. Para México, bastan los 10 dígitos."); return; }
    if (!message.trim()) { setError("Escribe el mensaje antes de abrir WhatsApp."); return; }
    setError("");
    // Solo abre el borrador: el usuario elige Enviar en WhatsApp.
    window.location.assign(`https://wa.me/${digits}?text=${encodeURIComponent(message.trim())}`);
  }

  return (
    <section className="rounded-3xl bg-panel p-5">
      <div className="text-[13px] text-dim">Asistente de WhatsApp · modo supervisado</div>
      <p className="mt-2 text-[15px] text-dim">Prepara mensajes para clientes y ábrelos en WhatsApp. Sofía nunca los envía automáticamente.</p>
      <label className="mt-4 block text-[13px] text-dim">Cliente (opcional)
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del cliente" className="mt-1 w-full rounded-xl bg-raise px-4 py-3 text-[16px] text-ivory" />
      </label>
      <label className="mt-3 block text-[13px] text-dim">WhatsApp del destinatario
        <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="81 1234 5678" className="mt-1 w-full rounded-xl bg-raise px-4 py-3 text-[16px] text-ivory" />
      </label>
      <div className="mt-4 text-[13px] text-dim">Elegir mensaje</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" aria-pressed={template === t.id} onClick={() => choose(t.id)}
            className={`min-h-11 rounded-full px-4 text-[14px] ${template === t.id ? "bg-sand text-ink" : "bg-raise text-ivory"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-[13px] text-dim">Revisa y edita antes de abrir WhatsApp
        <textarea rows={7} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2500}
          className="mt-1 w-full rounded-xl bg-raise px-4 py-3 text-[16px] leading-relaxed text-ivory" />
      </label>
      {error && <p role="alert" className="mt-2 text-[14px] text-alert">{error}</p>}
      <button type="button" onClick={openWhatsApp} className="mt-4 min-h-14 w-full rounded-2xl bg-sand text-[16px] font-semibold text-ink">
        Revisar y enviar en WhatsApp
      </button>
      <p className="mt-2 text-[12px] text-faint">Se abre WhatsApp con el texto preparado. El mensaje sale únicamente cuando tú pulsas Enviar. Verifica el número y el consentimiento del cliente.</p>
    </section>
  );
}
