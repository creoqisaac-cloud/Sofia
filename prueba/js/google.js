// Cliente de Google (servidor/google/sofia-google.gs): la cuenta de Google del asesor hace de servidor GRATIS.
//  - Correo:     envía desde su Gmail con adjuntos, revisa respuestas y sugiere el estado (palabras clave, sin IA).
//  - Calendario: recordatorios en el calendario "Sofía" con aviso (suenan en el iPhone vía Google Calendar).
//  - OCR:        segundo lector de fotos (INE) con el OCR gratuito de Google Drive.
// Es un extra: todo lo demás funciona sin esto. La app guarda solo la dirección …/exec y su clave.
import { state, save, isAppsScript } from "./store.js";
import { blobToBase64, shrinkImage } from "./util.js";
import { textToObservation } from "./ocr-obs.js";

const MAX_ADJUNTOS = 18 * 1024 * 1024; // Gmail: 25 MB por correo contando la codificación
const MAX_FOTOS = 6;
const SCRIPT_VIEJO = "Tu script de Google es la versión anterior (solo respaldo). Pega el nuevo sofia-google.gs y crea una nueva versión de la implementación (servidor/google/LEEME.md).";

/** Dirección y clave del script. Sin una propia, sirve la del servidor cuando es de Google (…/exec). */
function conf() {
  const g = state.settings.google ?? {};
  if (g.url?.trim()) return { url: g.url.trim(), token: (g.token ?? "").trim() };
  if (isAppsScript()) return { url: state.settings.server.url.trim(), token: (state.settings.server.token ?? "").trim() };
  return { url: "", token: "" };
}

export const googleReady = () => {
  const { url, token } = conf();
  return Boolean(/^https:\/\/script\.google\.com\/.+\/exec\/?$/.test(url) && token);
};
/** Lo último que respondió Google (para decidir qué mostrar sin esperar a la red). */
export const lastGoogleStatus = () => state.settings.google?.status ?? null;

/** Llama una acción del script: POST text/plain { token, action, … } (sin "preflight"; fetch sigue el 302). */
export async function gcall(action, payload = {}) {
  if (!googleReady()) throw new Error("Conecta tu cuenta de Google en Más → Conexiones.");
  const { url, token } = conf();
  let res;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...payload, action, token }) });
  } catch {
    throw new Error("No hay conexión con Google. Revisa internet o la dirección en Conexiones.");
  }
  if ((res.headers.get("content-type") ?? "").includes("application/json")) {
    const data = await res.json();
    // El script anterior (google-apps-script.gs) solo sabe guardar respaldos: contesta esto a cualquier acción.
    if (data.ok === false && data.error === "No es un respaldo de Sofía") throw new Error(SCRIPT_VIEJO);
    if (!res.ok || data.ok === false) throw new Error(data.error || `Google respondió ${res.status}`);
    return data;
  }
  // Una página en vez de JSON: la implementación pide iniciar sesión, ya no existe o el script falló.
  throw new Error(res.ok ? "Google no contestó como Sofía espera. Revisa que la implementación sea «Aplicación web» con acceso «Cualquier usuario»." : `Google respondió ${res.status}`);
}

export async function googleStatus() {
  const st = await gcall("estado");
  state.settings.google = { ...state.settings.google, status: { at: new Date().toISOString(), cuenta: st.cuenta, servicios: st.servicios, correo: st.correo, version: st.version } };
  save();
  return st;
}

// ───────── Correo (Gmail) ─────────

/**
 * Envía desde el Gmail del asesor. files: [{ blob, name }] (lo mismo que recibe deliverFiles).
 * ref: id del caso en la app (p. ej. el id del cliente) para revisar respuestas y dar seguimiento.
 * seguimientoDias: días sin respuesta antes del seguimiento automático de este caso (0 = nunca).
 * enHilo: contesta a todos en el hilo que ya tiene el caso (p. ej. "Correo de seguimiento").
 * Devuelve { threadId, enviadoAt, adjuntos, cuotaRestante, aviso? }. Con aviso el correo SÍ salió (no reintentar):
 * solo falló etiquetarlo o dejarlo en seguimiento; muéstralo al asesor.
 */
export async function sendEmail({ to, cc = "", subject, body, files = [], ref, seguimientoDias, enHilo = false, nombre = state.settings.advisorName }) {
  const total = files.reduce((n, f) => n + (f.blob?.size ?? 0), 0);
  if (total > MAX_ADJUNTOS) throw new Error("Los adjuntos pesan más de 18 MB (límite de Gmail). Quita algunos o usa fotos más ligeras.");
  const attachments = await Promise.all(files.map(async (f) => ({ name: f.name, mime: f.blob.type || "application/octet-stream", base64: await blobToBase64(f.blob) })));
  return gcall("correo.enviar", { to, cc, subject, body, attachments, ref, seguimientoDias, enHilo, nombre });
}

/**
 * Respuestas por caso (todos los seguidos, o solo refs): [{ ref, asunto, enviadoAt, esperando,
 * respuestas: [{ de, fecha, texto, adjuntos: [nombres], estado }], sugerido: { clave, texto, coincidencia } | null }].
 * clave: "falta_documento" | "pago" | "placas_listas" | "en_tramite".
 */
export const checkEmails = async (refs) => (await gcall("correo.revisar", refs ? { refs: [].concat(refs) } : {})).casos;

/** { seguimientoAuto, dias, texto }: seguimiento automático (al encenderlo, Google instala el agente). */
export const setEmailConfig = (cfg) => gcall("correo.config", cfg);

/** Ya no dar seguimiento automático a un caso (p. ej. placas entregadas). */
export const closeEmailCase = (ref) => gcall("correo.cerrar", { ref });

// ───────── Calendario ─────────

/**
 * Crea o mueve el evento en el calendario "Sofía" con aviso emergente (Google acepta de 5 min a 4 semanas antes).
 * Devuelve el id del evento: guárdalo en el recordatorio para moverlo o borrarlo después.
 */
export async function saveEvent({ id, title, description = "", at, minutes = 15, alerts = [5] }) {
  const inicio = new Date(at);
  if (Number.isNaN(inicio.getTime())) throw new Error("La fecha del recordatorio no es válida.");
  const r = await gcall("calendario.guardar", { id, titulo: title, descripcion: description, inicio: inicio.toISOString(), minutos: minutes, avisos: alerts });
  return r.id;
}

export const deleteEvent = (id) => gcall("calendario.borrar", { id });

// ───────── OCR de Google Drive ─────────

/** Texto de cada foto (o PDF), en el mismo orden. Google no guarda las fotos. */
export async function ocrImages(blobs) {
  const list = [].concat(blobs).filter(Boolean);
  if (list.length > MAX_FOTOS) throw new Error(`Máximo ${MAX_FOTOS} fotos por lectura.`);
  const images = [];
  for (const b of list) {
    const img = await shrinkImage(b, 2000, 0.88); // ~2000 px en JPG: Google lee mejor y pesa poco (HEIC → JPG)
    images.push({ mime: img.type || "image/jpeg", base64: await blobToBase64(img) });
  }
  return (await gcall("ocr", { images })).texts;
}

/** Observación de una foto lista para readIne (mismo formato que el texto pegado). */
export async function ocrObservation(blob) {
  const [text] = await ocrImages([blob]);
  return { ...textToObservation(text), engine: "google" };
}
