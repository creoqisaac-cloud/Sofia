/**
 * Voz = una CAPA sobre el mismo comando de texto. No hay lógica comercial aquí.
 *
 * VoiceProvider abstrae el reconocimiento:
 *  - "web-speech": SpeechRecognition / webkitSpeechRecognition del navegador (Safari iOS, Chrome).
 *  - "none": no disponible (o sin contexto seguro) → la app usa el campo de texto; en iPhone,
 *    el dictado del teclado (🎤) funciona siempre.
 *  - Futuro: un proveedor STT de servidor que implemente la misma interfaz.
 */

export interface VoiceHandlers {
  onPartial(text: string): void;
  onFinal(text: string): void;
  onError(message: string): void;
  onEnd(): void;
}

export interface VoiceProvider {
  readonly kind: "web-speech" | "none" | "server";
  readonly available: boolean;
  /** Motivo por el que no está disponible (para mostrar el respaldo de texto). */
  readonly reason?: string;
  start(h: VoiceHandlers): () => void;
}

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => RecognitionLike;

export interface VoiceEnv {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
  isSecureContext?: boolean;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Permite el micrófono para Sofía (Ajustes › Safari › Micrófono) o usa el dictado del teclado.",
  "service-not-allowed": "El dictado del navegador no está disponible aquí. Usa el micrófono del teclado.",
  "no-speech": "No te escuché. Intenta de nuevo.",
  network: "Sin conexión para reconocer voz. Usa el dictado del teclado.",
  "audio-capture": "No encontré micrófono.",
};

export const NO_VOICE_TIP = "Toca el campo y usa el micrófono del teclado para dictar.";

const none = (reason: string): VoiceProvider => ({ kind: "none", available: false, reason, start: () => () => {} });

/** Detecta el mejor proveedor disponible. `env` se inyecta para poder probarlo sin navegador. */
export function createVoiceProvider(env: VoiceEnv | undefined = typeof window !== "undefined" ? (window as unknown as VoiceEnv) : undefined): VoiceProvider {
  if (!env) return none("Sin navegador");
  const Ctor = (env.SpeechRecognition ?? env.webkitSpeechRecognition) as RecognitionCtor | undefined;
  if (!Ctor) return none("Este navegador no ofrece reconocimiento de voz.");
  if (env.isSecureContext === false) return none("El reconocimiento de voz del navegador requiere HTTPS.");
  return {
    kind: "web-speech",
    available: true,
    start(h) {
      let rec: RecognitionLike;
      try {
        rec = new Ctor();
      } catch {
        h.onError("No se pudo iniciar el micrófono.");
        h.onEnd();
        return () => {};
      }
      rec.lang = "es-MX";
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      let finalText = "";
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]!;
          if (r.isFinal) finalText += r[0]!.transcript;
          else interim += r[0]!.transcript;
        }
        h.onPartial((finalText + interim).trim());
      };
      rec.onerror = (e) => h.onError(ERRORS[e.error] ?? "No pude escuchar. Usa el campo de texto.");
      rec.onend = () => {
        if (finalText.trim()) h.onFinal(finalText.trim());
        h.onEnd();
      };
      try {
        rec.start();
      } catch {
        h.onError("No se pudo iniciar el micrófono.");
        h.onEnd();
      }
      return () => {
        try {
          rec.stop();
        } catch {
          /* ya detenido */
        }
      };
    },
  };
}

/** Respuesta hablada opcional (síntesis del sistema, sin red). */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const clean = text.replace(/\(datos DEMO\)/g, "").replace(/\$/g, "").trim();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = "es-MX";
  u.rate = 1.05;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
