"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { ErrorNote } from "./ui";

/** Chat nuevo: nombre/teléfono (opcional) + lo que escribió el cliente. */
export function NewChat() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return setError("Pega lo que te escribió el cliente.");
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ customerId: string }>("/api/desk/chats", { body: { name: name.trim() || null, phone: phone.trim() || null, text, as: "auto" } });
      router.push(`/ventas/chat/${r.customerId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-3xl bg-panel p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[13px] text-dim">
          Nombre (opcional)
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Pérez" className="mt-1 w-full rounded-xl bg-raise px-4 py-3 text-[16px] text-ivory placeholder:text-faint" />
        </label>
        <label className="block text-[13px] text-dim">
          WhatsApp
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="81 1234 5678" className="mt-1 w-full rounded-xl bg-raise px-4 py-3 text-[16px] text-ivory placeholder:text-faint" />
        </label>
      </div>
      <label className="block text-[13px] text-dim">
        Lo que te escribió (pega uno o varios mensajes)
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder={"hola buenas tardes\ncuanto sale la hrv?\ntengo 50 mil de enganche"}
          className="mt-1 w-full rounded-xl bg-raise px-4 py-3 text-[16px] leading-relaxed text-ivory placeholder:text-faint"
        />
      </label>
      <p className="text-[12px] text-faint">Si el teléfono ya existe, se agrega a ese cliente. Puedes pegar el chat copiado de WhatsApp tal cual (con fecha y nombre): Sofía distingue lo que dijo el cliente y lo que dijiste tú.</p>
      <ErrorNote error={error} />
      <button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-sand text-[16px] font-semibold text-ink disabled:opacity-50">
        {busy ? "Sofía está leyendo…" : "Que Sofía conteste"}
      </button>
    </form>
  );
}
