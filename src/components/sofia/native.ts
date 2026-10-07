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

type LocalNotif = {
  id: number;
  title: string;
  body: string;
  schedule?: { at: string; allowWhileIdle?: boolean };
  channelId?: string;
  extra?: Record<string, unknown>;
  autoCancel?: boolean;
};

type Plugins = {
  SofiaDocumentScanner?: {
    scanAndRecognize(o: { pageLimit?: number; galleryImport?: boolean }): Promise<NativeScanResult>;
    recognizeImage?(o: { base64: string }): Promise<{ engine: string; pages: unknown[] }>;
  };
  LocalNotifications?: {
    schedule(o: { notifications: LocalNotif[] }): Promise<unknown>;
    getPending(): Promise<{ notifications: Array<{ id: number; extra?: Record<string, unknown> }> }>;
    cancel(o: { notifications: Array<{ id: number }> }): Promise<void>;
    createChannel(o: { id: string; name: string; description?: string; importance?: number; visibility?: number; vibration?: boolean; lights?: boolean }): Promise<void>;
    checkPermissions(): Promise<{ display: string }>;
    requestPermissions(): Promise<{ display: string }>;
    checkExactNotificationSetting?(): Promise<{ exact_alarm: string }>;
    changeExactNotificationSetting?(): Promise<{ exact_alarm: string }>;
    addListener(event: string, cb: (e: { notification: { extra?: Record<string, unknown> } }) => void): Promise<{ remove(): void }> | { remove(): void };
  };
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

/** ¿La APK puede leer texto de una foto (ML Kit en la tablet)? */
export const hasNativePhotoOcr = () => {
  const { isNative, plugins } = cap();
  return isNative && typeof plugins.SofiaDocumentScanner?.recognizeImage === "function";
};

/** OCR de una foto en la tablet. Devuelve la observación estructurada (bloques, renglones, cajas). */
export async function recognizePhotoNative(file: Blob): Promise<{ engine: string; pages: unknown[] }> {
  const scanner = cap().plugins.SofiaDocumentScanner;
  if (!scanner?.recognizeImage) throw new Error("OCR no disponible.");
  return scanner.recognizeImage({ base64: await toBase64(file) });
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ───────── Recordatorios y alarmas (notificaciones locales de Android) ─────────

export const CHANNEL_REMINDERS = "sofia-recordatorios";
export const CHANNEL_ALARMS = "sofia-alarmas";

export interface DeviceReminderDto {
  notificationId: number;
  title: string;
  body: string;
  at: string;
  url: string;
  alarm: boolean;
}

export const notificationsAvailable = () => {
  const { isNative, plugins } = cap();
  return isNative && typeof plugins.LocalNotifications?.schedule === "function";
};

let channelsReady = false;
async function ensureChannels() {
  const ln = cap().plugins.LocalNotifications!;
  if (channelsReady) return;
  await ln.createChannel({ id: CHANNEL_REMINDERS, name: "Recordatorios", description: "Seguimientos y citas", importance: 4, visibility: 1, vibration: true });
  await ln.createChannel({ id: CHANNEL_ALARMS, name: "Alarmas", description: "Avisos urgentes (citas en 15 min, promesas)", importance: 5, visibility: 1, vibration: true, lights: true });
  channelsReady = true;
}

export async function notificationPermission(): Promise<{ display: string; exact: string | null }> {
  const ln = cap().plugins.LocalNotifications;
  if (!ln) return { display: "unavailable", exact: null };
  const { display } = await ln.checkPermissions();
  const exact = ln.checkExactNotificationSetting ? (await ln.checkExactNotificationSetting()).exact_alarm : null;
  return { display, exact };
}

export async function requestNotificationPermission() {
  const ln = cap().plugins.LocalNotifications;
  if (!ln) return "unavailable";
  return (await ln.requestPermissions()).display;
}

/** Android 12+: abre el ajuste de "Alarmas y recordatorios" para que suenen a la hora exacta. */
export async function openExactAlarmSetting() {
  const ln = cap().plugins.LocalNotifications;
  if (ln?.changeExactNotificationSetting) await ln.changeExactNotificationSetting();
}

const toNotif = (r: DeviceReminderDto): LocalNotif => ({
  id: r.notificationId,
  title: r.title,
  body: r.body,
  schedule: { at: new Date(r.at).toISOString(), allowWhileIdle: true },
  channelId: r.alarm ? CHANNEL_ALARMS : CHANNEL_REMINDERS,
  extra: { sofia: true, url: r.url },
  autoCancel: true,
});

/**
 * Trae los avisos del servidor y los programa en la tablet (reemplaza los de Sofía ya programados).
 * Una vez programados suenan aunque la app esté cerrada o sin internet.
 */
export async function syncDeviceReminders(): Promise<number> {
  if (!notificationsAvailable()) return 0;
  const ln = cap().plugins.LocalNotifications!;
  const res = await fetch("/api/reminders", { credentials: "include", cache: "no-store" });
  if (!res.ok) return 0;
  const { reminders } = (await res.json()) as { reminders: DeviceReminderDto[] };
  await ensureChannels();
  const pending = await ln.getPending();
  const ours = pending.notifications.filter((n) => n.extra?.sofia === true && n.extra?.test !== true);
  if (ours.length) await ln.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  if (reminders.length) await ln.schedule({ notifications: reminders.map(toNotif) });
  return reminders.length;
}

/** Prueba: una alarma dentro de unos segundos. */
export async function scheduleTestAlarm(seconds = 10) {
  const ln = cap().plugins.LocalNotifications;
  if (!ln) throw new Error("Las alarmas funcionan en la app de la tablet.");
  await ensureChannels();
  await ln.schedule({
    notifications: [{ id: 990001, title: "⏰ Prueba de Sofía", body: "Así suenan las alarmas de Sofía.", schedule: { at: new Date(Date.now() + seconds * 1000).toISOString(), allowWhileIdle: true }, channelId: CHANNEL_ALARMS, extra: { sofia: true, test: true, url: "/settings/reminders" } }],
  });
}

/** Al tocar una notificación, abrir el cliente correspondiente. */
export function onNotificationTap(handler: (url: string) => void): () => void {
  const ln = cap().plugins.LocalNotifications;
  if (!ln) return () => {};
  let sub: { remove(): void } | null = null;
  let cancelled = false;
  Promise.resolve(ln.addListener("localNotificationActionPerformed", (e) => {
    const url = e.notification.extra?.url;
    if (typeof url === "string" && url.startsWith("/")) handler(url);
  })).then((s) => {
    sub = s;
    if (cancelled) s.remove();
  });
  return () => {
    cancelled = true;
    sub?.remove();
  };
}
