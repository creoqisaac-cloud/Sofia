"use client";

/** Asignar el correo desde el que Sofía envía (con confirmación de Mario en cada envío). */
import { useState } from "react";

type Preset = { label: string; host: string; port: number; secure: boolean; help: string };
export interface EmailAccountView {
  configured: boolean;
  preset?: string;
  address?: string;
  displayName?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  verifiedAt?: string;
}

const field = "mt-1 w-full rounded-xl bg-raise px-3 py-3 text-[17px] text-ivory placeholder:text-faint focus:outline-none";
const big = "flex min-h-14 items-center justify-center rounded-2xl px-4 text-[16px]";

export function EmailAccountForm({ initial, presets }: { initial: EmailAccountView; presets: Record<string, Preset> }) {
  const [account, setAccount] = useState(initial);
  const [preset, setPreset] = useState(initial.preset ?? "gmail");
  const [address, setAddress] = useState(initial.address ?? "");
  const [displayName, setDisplayName] = useState(initial.displayName ?? "Mario Abarca");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState(initial.preset === "custom" ? initial.host ?? "" : "");
  const [port, setPort] = useState(String(initial.preset === "custom" ? initial.port ?? 587 : 587));
  const [secure, setSecure] = useState(initial.preset === "custom" ? Boolean(initial.secure) : false);
  const [user, setUser] = useState(initial.user && initial.user !== initial.address ? initial.user : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const p = presets[preset] ?? presets.custom!;

  async function call(method: "PUT" | "POST" | "DELETE", body?: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/settings/email", { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = (await r.json()) as { error?: string; account?: EmailAccountView; sentTo?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo completar.");
      return j;
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const j = await call("PUT", { preset, address, displayName, password, host, port, secure, user });
    if (j?.account) {
      setAccount(j.account);
      setPassword("");
      setMsg({ ok: true, text: "Cuenta conectada. Sofía ya puede enviar los correos que confirmes." });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-3xl bg-panel p-5">
        <div className="text-[13px] text-dim">Cuenta actual</div>
        {account.configured ? (
          <div className="mt-1 text-[18px] text-ivory">
            {account.address} <span className="text-[14px] text-good">· conectada</span>
            <div className="text-[13px] text-faint">
              {account.host}:{account.port} · verificada {account.verifiedAt ? new Date(account.verifiedAt).toLocaleString("es-MX") : ""}
            </div>
          </div>
        ) : (
          <div className="mt-1 text-[16px] text-dim">Sin cuenta: los correos se abren en tu app de correo y los envías tú.</div>
        )}
        {account.configured && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={async () => { const j = await call("POST", {}); if (j?.sentTo) setMsg({ ok: true, text: `Correo de prueba enviado a ${j.sentTo}.` }); }} className={`${big} bg-raise text-ivory`}>
              Enviar prueba
            </button>
            <button type="button" disabled={busy} onClick={async () => { if (!confirm("¿Quitar la cuenta de correo de Sofía?")) return; const j = await call("DELETE"); if (j) { setAccount({ configured: false }); setMsg({ ok: true, text: "Cuenta quitada." }); } }} className={`${big} bg-raise text-dim`}>
              Quitar cuenta
            </button>
          </div>
        )}
      </section>

      <form onSubmit={save} className="rounded-3xl bg-panel p-5">
        <div className="text-[16px] text-ivory">{account.configured ? "Cambiar cuenta" : "Asignar correo a Sofía"}</div>
        <label className="mt-3 block text-[13px] text-dim">
          Proveedor
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className={field}>
            {Object.entries(presets).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-[13px] text-faint">{p.help}</p>
        <label className="mt-3 block text-[13px] text-dim">
          Correo
          <input name="address" type="email" inputMode="email" autoCapitalize="off" required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="tucorreo@gmail.com" className={field} />
        </label>
        <label className="mt-3 block text-[13px] text-dim">
          Nombre que verá el destinatario
          <input name="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={field} />
        </label>
        <label className="mt-3 block text-[13px] text-dim">
          Contraseña de aplicación {account.configured && "(déjala vacía para conservar la actual)"}
          <input name="password" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
        </label>
        {preset === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="col-span-2 block text-[13px] text-dim">
              Servidor SMTP
              <input name="host" autoCapitalize="off" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.agencia.com.mx" className={field} />
            </label>
            <label className="block text-[13px] text-dim">
              Puerto
              <input name="port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} className={field} />
            </label>
            <label className="flex items-end gap-2 pb-3 text-[15px] text-ivory">
              <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} className="h-6 w-6" /> SSL directo (465)
            </label>
            <label className="col-span-2 block text-[13px] text-dim">
              Usuario (si es distinto del correo)
              <input name="user" autoCapitalize="off" value={user} onChange={(e) => setUser(e.target.value)} className={field} />
            </label>
          </div>
        )}
        <button type="submit" disabled={busy} className={`${big} mt-5 w-full bg-sand font-semibold text-ink`}>
          {busy ? "Comprobando…" : "Conectar y guardar"}
        </button>
        <p className="mt-2 text-[12px] text-faint">Se comprueba la conexión antes de guardar. La contraseña se guarda cifrada en el servidor de Sofía; no queda en la tablet ni se muestra otra vez. Cada correo se envía solo cuando tú lo confirmas.</p>
      </form>
      {msg && <p className={`text-[15px] ${msg.ok ? "text-good" : "text-alert"}`}>{msg.text}</p>}
    </div>
  );
}
