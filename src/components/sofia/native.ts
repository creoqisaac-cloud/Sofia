"use client";

/**
 * Puente a lo nativo de la APK (Capacitor). Dentro de la app usa los plugins Share y Filesystem
 * (inyectados por la APK en window.Capacitor); en un navegador cae a Web Share / descarga.
 * No se importa @capacitor/* en el bundle web: la página es la misma para navegador y APK.
 */

/** Resultado del escáner nativo (ML Kit en la tablet): observación de OCR + archivo para subir. */
export interface NativeScanResult {
  engine: string;
  pageCount: number;
  pages: unknown[];
  file: { base64: string; mime: string; name: string };
}

type Plugins = {
  SofiaDocumentScanner?: { scanAndRecognize(o: { pageLimit?: number; galleryImport?: boolean }): Promise<NativeScanResult> };
  Share?: { share(o: { title?: string; text?: string; url?: string; files?: string[]; dialogTitle?: string }): Promise<unknown> };
  Filesystem?: { writeFile(o: { path: string; data: string; directory: string; recursive?: boolean }): Promise<{ uri: string }> };
};

function cap(): { isNative: boolean; plugins: Plugins } {
  const w = typeof window !== "undefined" ? (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Plugins } }) : {};
  return { isNative: Boolean(w.Capacitor?.isNativePlatform?.()), plugins: w.Capacitor?.Plugins ?? {} };
}

export const isNativeApp = () => cap().isNative;

async function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function fetchFile(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("No se pudo descargar el archivo.");
  return res.blob();
}

const safeName = (s: string) => s.replace(/[^\w.-]+/g, "_").slice(0, 80);

/** Escribe archivos temporales en la caché de la app y abre la hoja de compartir de Android. */
export async function shareFiles(files: Array<{ url: string; name: string }>, opts: { title?: string; text?: string } = {}): Promise<"shared" | "downloaded"> {
  const { isNative, plugins } = cap();
  if (isNative && plugins.Share && plugins.Filesystem) {
    const uris: string[] = [];
    for (const f of files) {
      const data = await toBase64(await fetchFile(f.url));
      const w = await plugins.Filesystem.writeFile({ path: `compartir/${Date.now()}-${safeName(f.name)}`, data, directory: "CACHE", recursive: true });
      uris.push(w.uri);
    }
    await plugins.Share.share({ title: opts.title, text: opts.text, files: uris, dialogTitle: "Compartir" });
    return "shared";
  }
  // Navegador: Web Share con archivos (si existe) o descarga.
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  const blobs = await Promise.all(files.map(async (f) => new File([await fetchFile(f.url)], safeName(f.name), { type: "application/octet-stream" })));
  if (nav.share && nav.canShare?.({ files: blobs })) {
    await nav.share({ title: opts.title, text: opts.text, files: blobs });
    return "shared";
  }
  for (const b of blobs) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = b.name;
    a.click();
  }
  return "downloaded";
}

/** Guarda un archivo en Documentos de la tablet (o lo descarga en un navegador). */
export async function saveFile(url: string, name: string): Promise<string> {
  const { isNative, plugins } = cap();
  if (isNative && plugins.Filesystem) {
    const data = await toBase64(await fetchFile(url));
    await plugins.Filesystem.writeFile({ path: `Sofia/${safeName(name)}`, data, directory: "DOCUMENTS", recursive: true });
    return `Guardado en Documentos/Sofia/${safeName(name)}`;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName(name);
  a.click();
  return "Descargado";
}

/** Abrir para ver: en la APK se abre con el visor de PDF de Android (vía compartir → abrir con). */
export async function openFile(url: string, name: string) {
  const { isNative } = cap();
  if (isNative) return shareFiles([{ url, name }], { title: name });
  window.open(url, "_blank");
  return "downloaded" as const;
}

/** ¿Hay escáner nativo? Solo dentro de la APK. En un navegador se sube a mano (no se simula OCR). */
export const hasNativeScanner = () => {
  const { isNative, plugins } = cap();
  return isNative && typeof plugins.SofiaDocumentScanner?.scanAndRecognize === "function";
};

/** Abre el escáner de la tablet (captura guiada, recorte, enderezado) y reconoce el texto EN el dispositivo. */
export async function scanWithNativeScanner(opts: { pageLimit?: number } = {}): Promise<NativeScanResult | null> {
  const scanner = cap().plugins.SofiaDocumentScanner;
  if (!scanner) throw new Error("El escáner solo está disponible en la app de la tablet.");
  try {
    return await scanner.scanAndRecognize({ pageLimit: opts.pageLimit ?? 2, galleryImport: true });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "CANCELLED" || /cancel/i.test(err.message ?? "")) return null;
    throw new Error(err.message ?? "No se pudo escanear.");
  }
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
