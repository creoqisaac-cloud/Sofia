// Puente con lo nativo cuando la app corre dentro de la APK (Capacitor): escáner ML Kit,
// notificaciones locales y hoja de compartir de Android. En un navegador cae a lo equivalente web.
import { blobToBase64, download, safeName } from "./util.js";

const cap = () => window.Capacitor;
export const isNative = () => Boolean(cap()?.isNativePlatform?.());
const plugin = (name) => (isNative() ? cap()?.Plugins?.[name] : undefined);

export const hasScanner = () => typeof plugin("SofiaDocumentScanner")?.scanAndRecognize === "function";
export const scanner = () => plugin("SofiaDocumentScanner");

/** Abre WhatsApp, correo o teléfono. En la APK, Android elige la app; en web, una pestaña nueva. */
export function openExternal(url) {
  if (isNative() || /^(mailto|tel|sms):/i.test(url)) { location.href = url; return; }
  const w = window.open(url, "_blank", "noopener");
  if (!w) location.href = url;
}

/**
 * Entrega un archivo al usuario: en la APK abre "Compartir" (Gmail, WhatsApp, Drive, Archivos…);
 * en iPhone/Android web usa la hoja de compartir si existe; si no, lo descarga.
 */
export async function deliverFiles(files, { title = "", text = "" } = {}) {
  const Share = plugin("Share");
  const Filesystem = plugin("Filesystem");
  if (Share && Filesystem) {
    const uris = [];
    for (const f of files) {
      const w = await Filesystem.writeFile({ path: `compartir/${Date.now()}-${safeName(f.name)}`, data: await blobToBase64(f.blob), directory: "CACHE", recursive: true });
      uris.push(w.uri);
    }
    await Share.share({ title, text, files: uris, dialogTitle: title || "Compartir" });
    return "shared";
  }
  const list = files.map((f) => new File([f.blob], safeName(f.name), { type: f.blob.type || "application/octet-stream" }));
  if (navigator.canShare?.({ files: list })) {
    try {
      await navigator.share({ title, text, files: list });
      return "shared";
    } catch (e) {
      if (e?.name === "AbortError") return "cancelled";
    }
  }
  for (const f of list) download(f, f.name);
  return "downloaded";
}

// ───────── Notificaciones ─────────

const CHANNEL = "sofia-recordatorios";
let channelReady = false;

export const nativeNotifications = () => typeof plugin("LocalNotifications")?.schedule === "function";

export async function notificationsStatus() {
  const ln = plugin("LocalNotifications");
  if (ln) return (await ln.checkPermissions()).display; // granted | denied | prompt
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission === "default" ? "prompt" : Notification.permission;
}

export async function requestNotifications() {
  const ln = plugin("LocalNotifications");
  if (ln) return (await ln.requestPermissions()).display;
  if (!("Notification" in window)) return "unsupported";
  return Notification.requestPermission();
}

/** Programa en Android todos los recordatorios abiertos (suenan con la app cerrada y sin internet). */
export async function syncNativeReminders(reminders, customerName) {
  const ln = plugin("LocalNotifications");
  if (!ln) return 0;
  if (!channelReady) {
    await ln.createChannel({ id: CHANNEL, name: "Recordatorios", description: "Seguimientos de clientes", importance: 5, visibility: 1, vibration: true });
    channelReady = true;
  }
  const pending = await ln.getPending();
  const ours = pending.notifications.filter((n) => n.extra?.sofia === true);
  if (ours.length) await ln.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  const now = Date.now();
  const future = reminders.filter((r) => !r.done && new Date(r.at).getTime() > now).slice(0, 60);
  if (future.length) {
    await ln.schedule({
      notifications: future.map((r) => ({
        id: r.notifId,
        title: r.customerId ? `Sofía · ${customerName(r.customerId) ?? "Cliente"}` : "Sofía",
        body: r.text,
        schedule: { at: new Date(r.at).toISOString(), allowWhileIdle: true },
        channelId: CHANNEL,
        extra: { sofia: true, customerId: r.customerId ?? null },
        autoCancel: true,
      })),
    });
  }
  return future.length;
}

export function onNotificationTap(handler) {
  const ln = plugin("LocalNotifications");
  if (!ln) return;
  ln.addListener("localNotificationActionPerformed", (e) => handler(e.notification?.extra ?? {}));
}

/** Aviso inmediato en web (solo mientras la app está abierta). */
export function webNotify(title, body) {
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, icon: "icon-192.png" });
  } catch { /* algunos navegadores solo permiten notificaciones desde un service worker */ }
}
