// Cliente del conector (prueba/servidor): WhatsApp Business, Messenger y Facebook reales.
// La app nunca guarda tokens de Meta: solo la dirección del conector y su clave.
import { state, save, serverBase, isAppsScript } from "./store.js";

export const connectorReady = () => Boolean(serverBase() && !isAppsScript() && state.settings.server.token);
/** Lo último que respondió el conector (para decidir qué mostrar sin esperar a la red). */
export const lastStatus = () => state.settings.server.status ?? null;
export const waReady = () => connectorReady() && Boolean(lastStatus()?.whatsapp?.configured);
export const fbReady = () => connectorReady() && Boolean(lastStatus()?.facebook?.configured);

async function call(path, { method = "GET", params = {}, body } = {}) {
  if (!connectorReady()) throw new Error("Conecta tu servidor en Más → Conexiones.");
  const u = new URL(`${serverBase()}${path}`);
  if (method === "GET") {
    u.searchParams.set("token", state.settings.server.token);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  }
  let res;
  try {
    res = await fetch(u, method === "GET"
      ? { cache: "no-store" }
      : { method, headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...body, token: state.settings.server.token }) });
  } catch {
    throw new Error("No hay conexión con tu servidor. Revisa internet o la dirección en Conexiones.");
  }
  if ((res.headers.get("content-type") ?? "").includes("application/json")) {
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || `El servidor respondió ${res.status}`);
    return data;
  }
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
  return res;
}

export async function refreshStatus() {
  const st = await call("/api/estado");
  state.settings.server.status = { at: new Date().toISOString(), whatsapp: st.whatsapp, facebook: st.facebook, webhook: st.webhook, version: st.version };
  save();
  return st;
}

export const inbox = async () => (await call("/api/buzon")).conversations;
export const conversation = async (key) => (await call("/api/buzon/conversacion", { params: { c: key } })).messages;
export const sendMessage = (msg) => call("/api/enviar", { method: "POST", body: msg });
export const waTemplates = async () => (await call("/api/wa/plantillas")).templates;
export const publishPost = (post) => call("/api/facebook/publicar", { method: "POST", body: post });
export const listPosts = async () => (await call("/api/facebook/publicaciones")).posts;

/** Descarga una foto/documento que el cliente mandó por WhatsApp. */
export async function downloadMedia(id) {
  const res = await call("/api/media", { params: { id } });
  return res.blob();
}

/** ¿Sigue abierta la ventana de 24 h de WhatsApp? (después solo se permiten plantillas aprobadas) */
export const windowOpen = (lastInAt) => Boolean(lastInAt && Date.now() - new Date(lastInAt).getTime() < 24 * 3600 * 1000);

/** Últimos 10 dígitos: para cruzar el número de WhatsApp con los clientes guardados. */
export const phoneKey = (p) => String(p ?? "").replace(/\D/g, "").slice(-10);
