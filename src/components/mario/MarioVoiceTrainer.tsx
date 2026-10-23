"use client";

import { useState } from "react";

type Profile = {
  sampleCount: number; meanLength: number; paragraphStyle: string; tone: string;
  greeting: string; usesCompare: boolean; usesOye: boolean; usesMira: boolean;
  emoji: string; question: string;
};

export function MarioVoiceTrainer({ initial }: { initial: Profile | null }) {
  const [text, setText] = useState("");
  const [profile, setProfile] = useState<Profile | null>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const messages = text.split(/^\s*---+\s*$/m).map(t => t.trim()).filter(Boolean);
  async function save() {
    if (messages.length < 6 || messages.length > 80) {
      setMessage("Pega de 6 a 80 mensajes y separa cada uno con una línea que diga ---.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/mario/voice", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples: messages }),
      });
      const json = await res.json() as { profile?: Profile; error?: string };
      if (!res.ok || !json.profile) throw new Error(json.error ?? "No se guardó la calibración.");
      setProfile(json.profile);
      setText("");
      setMessage("Estilo calibrado. Los mensajes originales no se guardaron; solo sus patrones de escritura.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al guardar.");
    } finally { setSaving(false); }
  }
  return (
    <section className="rounded-3xl bg-panel p-5">
      <h2 className="text-[20px] font-semibold text-ivory">Enséñale cómo escribe Mario</h2>
      <p className="mt-2 text-[14px] text-dim">
        Usa mensajes reales autorizados por Mario. Retira nombres, teléfonos, direcciones, precios y cualquier dato privado de clientes antes de pegarlos.
        Solo guardamos estadísticas del estilo, no los textos originales.
      </p>
      <label className="mt-4 block text-[13px] text-dim">Mensajes auténticos de Mario, separados por ---</label>
      <textarea
        value={text} onChange={e => setText(e.target.value)}
        placeholder={"Qué onda compare, me llegó tu mensaje de la página de Honda. ¿Buscas nueva o seminueva?\n---\nOye, retomando lo de la camioneta, te paso unas opciones y lo vemos aquí en la agencia.\n---\n..."}
        className="mt-2 min-h-56 w-full rounded-xl bg-raise p-3 text-[15px] leading-relaxed text-ivory"
        autoComplete="off" spellCheck={false}
      />
      <div className="mt-2 text-[12px] text-dim">{messages.length} mensaje(s) detectados · entre 6 y 80</div>
      <button
        type="button" onClick={() => void save()}
        disabled={saving || messages.length < 6 || messages.length > 80}
        className="mt-3 min-h-12 w-full rounded-xl bg-sand px-4 text-[15px] font-semibold text-ink disabled:opacity-50"
      >{saving ? "Analizando…" : "Analizar personalidad de Mario"}</button>
      {message && <p role="status" className="mt-3 text-[13px] text-ivory">{message}</p>}
      {profile && (
        <div className="mt-5 rounded-xl bg-raise p-4 text-[14px] text-dim">
          <strong className="block text-ivory">Patrón de voz aprendido</strong>
          <p className="mt-2">Mensajes analizados: {profile.sampleCount}. Tono: {profile.tone.replaceAll("_", " ")}. Saludo: {profile.greeting.replaceAll("_", " ")}.</p>
          <p>Mensajes de ~{profile.meanLength} caracteres, estilo {profile.paragraphStyle.replaceAll("_", " ")}, emojis {profile.emoji.replaceAll("_", " ")}.</p>
          <p>Modismos detectados: {[profile.usesCompare && "compare", profile.usesOye && "oye", profile.usesMira && "mira"].filter(Boolean).join(", ") || "ninguno dominante"}.</p>
        </div>
      )}
    </section>
  );
}
