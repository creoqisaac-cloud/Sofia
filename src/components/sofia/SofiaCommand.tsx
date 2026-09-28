"use client";

/**
 * SofiaCommand — la entrada principal: escribe o dicta; Sofía entiende, busca o actúa.
 * Voz y texto van por el MISMO endpoint. Lo que modifica/envía algo pide "¿Confirmas?".
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmailDraft } from "./EmailDraft";
import { IconClose, IconMic, IconSend } from "./icons";
import { QuoteResult, type QuoteView } from "./QuoteResult";
import { createVoiceProvider, NO_VOICE_TIP, speak } from "./voice";

type Block =
  | { type: "text"; text: string }
  | { type: "quote"; quote: QuoteView }
  | { type: "list"; title?: string; items: Array<{ title: string; detail?: string; href?: string; tone?: "warn" | "ok" | "muted" }> }
  | { type: "email"; email: { id: string; to: string | null; subject: string; body: string; attachments: string[]; providerConfigured: boolean } }
  | { type: "missing"; title: string; items: string[] };

interface CommandResponse {
  intent: string;
  say: string;
  blocks: Block[];
  confirm?: { question: string; action: Record<string, unknown> };
  options?: Array<{ label: string; command: string }>;
  navigate?: string;
  customerId?: string | null;
  links?: Array<{ label: string; href: string }>;
}

const CTX_KEY = "sofia.lastCustomerId";
const readCtx = () => {
  try {
    return sessionStorage.getItem(CTX_KEY);
  } catch {
    return null;
  }
};
const writeCtx = (v: string | null) => {
  try {
    if (v) sessionStorage.setItem(CTX_KEY, v);
  } catch {
    /* sin almacenamiento */
  }
};

export function SofiaCommand({ placeholder = "Cotiza, busca, agenda…", autoFocus = false, customerId = null }: { placeholder?: string; autoFocus?: boolean; customerId?: string | null }) {
  const router = useRouter();
  const voice = useMemo(() => (typeof window === "undefined" ? null : createVoiceProvider()), []);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<CommandResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; href?: string } | null>(null);
  const [hits, setHits] = useState<Array<{ id: string; title: string; detail: string; href: string }>>([]);
  const stopRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fromVoice = useRef(false);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (customerId) writeCtx(customerId);
  }, [customerId]);

  // Búsqueda rápida mientras escribe (nombres, teléfono, pedido, factura, VIN…).
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onType(v: string) {
    setText(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = v.trim();
    if (q.length < 2 || q.split(/\s+/).length > 3) {
      setHits([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then((x) => x.json());
        setHits(r.hits ?? []);
      } catch {
        setHits([]);
      }
    }, 220);
  }

  async function run(command: string) {
    const t = command.trim();
    if (!t) return;
    if (listening) stopRef.current?.();
    setBusy(true);
    setError(null);
    setDone(null);
    setHits([]);
    try {
      const r = await fetch("/api/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t, context: { lastCustomerId: readCtx() } }) });
      const j = (await r.json()) as CommandResponse & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No pude procesarlo.");
      if (j.customerId) writeCtx(j.customerId);
      if (j.navigate) {
        router.push(j.navigate);
        setRes(null);
        return;
      }
      setRes(j);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      if (fromVoice.current) speak(j.say);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      fromVoice.current = false;
    }
  }

  function toggleMic() {
    setTip(null);
    if (listening) {
      stopRef.current?.();
      return;
    }
    if (!voice?.available) {
      setTip(`${voice?.reason ?? "Voz no disponible."} ${NO_VOICE_TIP}`);
      inputRef.current?.focus();
      return;
    }
    setPartial("");
    setListening(true);
    // Seguridad: si el navegador nunca cierra el reconocimiento, se detiene solo.
    const guard = setTimeout(() => {
      stopRef.current?.();
      setListening(false);
    }, 15_000);
    stopRef.current = voice.start({
      onPartial: (p) => setPartial(p),
      onFinal: (f) => {
        setText(f);
        fromVoice.current = true;
        void run(f);
      },
      onError: (m) => setTip(m),
      onEnd: () => {
        clearTimeout(guard);
        setListening(false);
      },
    });
  }

  async function confirm() {
    if (!res?.confirm) return;
    setBusy(true);
    try {
      const r = await fetch("/api/command/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: res.confirm.action }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "No se pudo.");
      setDone({ message: j.message, href: j.href });
      setRes(null);
      setText("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const clear = () => {
    setRes(null);
    setText("");
    setError(null);
    setDone(null);
    setTip(null);
  };

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(text);
        }}
        className="flex items-center gap-2 rounded-2xl bg-panel py-1.5 pl-4 pr-1.5 ring-1 ring-line focus-within:ring-sand/50"
      >
        <input
          ref={inputRef}
          value={listening ? partial : text}
          onChange={(e) => onType(e.target.value)}
          placeholder={listening ? "Escuchando…" : placeholder}
          autoFocus={autoFocus}
          enterKeyHint="go"
          autoComplete="off"
          aria-label="Comando para Sofía"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-[17px] text-ivory placeholder:text-faint focus:outline-none"
        />
        {text && !listening && (
          <button type="button" onClick={clear} aria-label="Limpiar" className="flex h-10 w-10 items-center justify-center text-faint">
            <IconClose width={18} height={18} />
          </button>
        )}
        <button type="submit" disabled={busy || !text.trim()} aria-label="Enviar comando" className="flex h-11 w-11 items-center justify-center rounded-xl bg-raise text-ivory disabled:opacity-30">
          <IconSend />
        </button>
      </form>

      <div className="mt-5 flex flex-col items-center">
        <button
          type="button"
          onClick={toggleMic}
          aria-label={listening ? "Detener" : "Hablar con Sofía"}
          className={`flex h-[84px] w-[84px] items-center justify-center rounded-full transition-colors ${listening ? "mic-live bg-sand text-ink" : "bg-ivory text-ink active:bg-sand"}`}
        >
          <IconMic width={34} height={34} strokeWidth={1.8} />
        </button>
        <div className="mt-2 h-5 text-[13px] text-dim">{listening ? "Te escucho…" : busy ? "Pensando…" : "Toca y habla"}</div>
      </div>

      {tip && <p className="mt-2 text-center text-[13px] text-alert">{tip}</p>}

      {hits.length > 0 && !res && (
        <ul className="mt-3 overflow-hidden rounded-2xl bg-panel">
          {hits.map((h) => (
            <li key={h.href}>
              <Link href={h.href} className="flex min-h-12 flex-col justify-center px-4 py-2 active:bg-raise">
                <span className="text-[15px] text-ivory">{h.title}</span>
                {h.detail && <span className="text-[13px] text-faint">{h.detail}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-4 rounded-2xl bg-panel p-4 text-[15px] text-alert">{error}</p>}
      {done && (
        <div className="mt-4 rounded-2xl bg-panel p-4 text-[15px] text-good">
          {done.message}
          {done.href && (
            <Link href={done.href} className="ml-2 text-sand underline underline-offset-4">
              Ver
            </Link>
          )}
        </div>
      )}

      {res && (
        <section ref={resultRef} className="mt-4 scroll-mt-4 space-y-3" aria-live="polite">
          {!res.blocks.some((b) => b.type === "quote" || b.type === "email") && <p className="px-1 text-[17px] leading-snug text-ivory">{res.say}</p>}
          {res.blocks.map((b, i) => (
            <ResultBlock key={i} b={b} customerId={res.customerId ?? null} onNew={() => { clear(); inputRef.current?.focus(); }} />
          ))}
          {res.confirm && (
            <div className="rounded-2xl bg-raise p-4">
              <p className="text-[16px] text-ivory">{res.confirm.question}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={confirm} className="min-h-12 rounded-2xl bg-sand text-[15px] font-semibold text-ink">
                  Confirmar
                </button>
                <button type="button" onClick={clear} className="min-h-12 rounded-2xl bg-panel text-[15px] text-ivory">
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {(res.options?.length || res.links?.length) && (
            <div className="flex flex-wrap gap-2">
              {res.options?.map((o) => (
                <button key={o.label} type="button" onClick={() => { setText(o.command); void run(o.command); }} className="min-h-10 rounded-full bg-panel px-4 text-[14px] text-ivory">
                  {o.label}
                </button>
              ))}
              {res.links?.map((l) => (
                <Link key={l.href} href={l.href} className="flex min-h-10 items-center rounded-full bg-panel px-4 text-[14px] text-sand">
                  {l.label} →
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ResultBlock({ b, customerId, onNew }: { b: Block; customerId: string | null; onNew: () => void }) {
  if (b.type === "quote") return <QuoteResult q={b.quote} customerId={customerId} onNew={onNew} />;
  if (b.type === "email") return <EmailDraft email={b.email} compact />;
  if (b.type === "text") return <p className="px-1 text-[15px] text-dim">{b.text}</p>;
  if (b.type === "missing")
    return (
      <div className="rounded-2xl bg-panel p-4">
        <div className="text-[15px] font-medium text-alert">{b.title}</div>
        <ul className="mt-1 text-[15px] text-ivory/90">
          {b.items.map((i) => (
            <li key={i}>· {i}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="overflow-hidden rounded-2xl bg-panel">
      {b.title && <div className="px-4 pt-3 text-[13px] text-dim">{b.title}</div>}
      <ul className="divide-y divide-line">
        {b.items.map((it, i) => {
          const inner = (
            <>
              <span className={`text-[15px] ${it.tone === "warn" ? "text-alert" : it.tone === "ok" ? "text-good" : "text-ivory"}`}>{it.title}</span>
              {it.detail && <span className="text-[13px] text-dim">{it.detail}</span>}
            </>
          );
          return (
            <li key={i}>
              {it.href ? (
                <Link href={it.href} className="flex min-h-12 flex-col justify-center px-4 py-2.5 active:bg-raise">
                  {inner}
                </Link>
              ) : (
                <div className="flex min-h-12 flex-col justify-center px-4 py-2.5">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
