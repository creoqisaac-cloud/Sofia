"use client";

/**
 * Mandar por WhatsApp sin API:
 *  - con fotos/videos: hoja de compartir del teléfono (Android/iPhone) con archivos + texto;
 *  - solo texto: abre el chat del cliente en WhatsApp con el mensaje escrito.
 * El texto siempre se copia al portapapeles por si WhatsApp no lo pega solo.
 */
import { isNativeApp, shareFiles } from "@/components/sofia/native";

export interface ShareMedia {
  id: string;
  title: string;
  mimeType: string;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "application/pdf": "pdf" };
const fileName = (m: ShareMedia) => `${m.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 50) || "archivo"}.${EXT[m.mimeType] ?? "bin"}`;

export function waDigits(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").replace(/\D/g, "");
  const n = raw.length === 10 ? `52${raw}` : raw.length === 12 && raw.startsWith("52") ? raw : raw.length === 13 && raw.startsWith("521") ? `52${raw.slice(3)}` : raw;
  return /^\d{11,15}$/.test(n) ? n : null;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export type ShareOutcome = "shared" | "opened" | "downloaded" | "copied" | "cancelled";

export async function sendToWhatsApp(args: { phone: string | null; text: string; media: ShareMedia[] }): Promise<ShareOutcome> {
  const text = args.text.trim();
  await copyText(text);
  if (args.media.length) {
    if (isNativeApp()) {
      const r = await shareFiles(args.media.map((m) => ({ url: `/api/desk/media/${m.id}`, name: fileName(m) })), { title: "Enviar", text });
      return r;
    }
    try {
      const files = await Promise.all(
        args.media.map(async (m) => {
          const res = await fetch(`/api/desk/media/${m.id}`, { credentials: "include" });
          if (!res.ok) throw new Error("No se pudo descargar el archivo.");
          const blob = await res.blob();
          return new File([blob], fileName(m), { type: blob.type || m.mimeType });
        }),
      );
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files, text })) {
        await nav.share({ files, text });
        return "shared";
      }
      for (const f of files) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(f);
        a.download = f.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      }
      const digits = waDigits(args.phone);
      if (digits) window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      return "downloaded";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
      throw e;
    }
  }
  const digits = waDigits(args.phone);
  if (!digits) return "copied";
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  if (isNativeApp()) window.location.assign(url);
  else window.open(url, "_blank", "noopener");
  return "opened";
}

export const OUTCOME_TEXT: Record<ShareOutcome, string> = {
  shared: "Listo. Elige WhatsApp y el chat del cliente; el texto también quedó copiado.",
  opened: "Se abrió WhatsApp con el mensaje. Toca Enviar allá.",
  downloaded: "Se descargaron los archivos y se abrió WhatsApp; adjúntalos allá. El texto quedó copiado.",
  copied: "El cliente no tiene teléfono válido: copié el mensaje para que lo pegues.",
  cancelled: "Cancelado.",
};
