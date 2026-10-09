// Cliente del conector (prueba/servidor): WhatsApp Business, Messenger y Facebook reales.
// La app nunca guarda tokens de Meta: solo la dirección del conector y su clave.
import { state, save, serverBase, isAppsScript } from "./store.js";

export const connectorReady = () => Boolean(serverBase() && !isAppsScript() && state.settings.server.token);
/** Lo último que respondió el conector (para decidir qué mostrar sin esperar a la red). */
export const lastStatus = () => state.settings.server.status ?? null;
export const waReady = () => connectorReady() && Boolean(lastStatus()?.whatsapp?.configured);
export const fbReady = () => connectorReady() && Boolean(lastStatus()?.facebook?.configured);
export const igReady = () => connectorReady() && Boolean(lastStatus()?.instagram?.configured);

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
  state.settings.server.status = {
    at: new Date().toISOString(), whatsapp: st.whatsapp, facebook: st.facebook, instagram: st.instagram, webhook: st.webhook, version: st.version,
    agente: st.agente, prospectos: st.prospectos, programadas: st.programadas, publicUrl: st.publicUrl,
  };
  save();
  return st;
}

export const inbox = async () => (await call("/api/buzon")).conversations;
export const conversation = async (key) => (await call("/api/buzon/conversacion", { params: { c: key } })).messages;
export const sendMessage = (msg) => call("/api/enviar", { method: "POST", body: msg });
export const waTemplates = async () => (await call("/api/wa/plantillas")).templates;
export const publishPost = (post) => call("/api/facebook/publicar", { method: "POST", body: post });
export const listPosts = async () => (await call("/api/facebook/publicaciones")).posts;

// ── Agente sin IA del conector: contesta solo en WhatsApp/Messenger aunque la app esté cerrada ──
/** { activo, zonaHoraria, horario { dias, inicio, fin }, bienvenida, fueraDeHorario, reglas [{ palabras, respuesta }], esperaHoras, pausaMinutos, asesor, agencia } */
export const getAgentConfig = async () => (await call("/api/agente/config")).config;
/** Guarda solo lo que cambies (lo demás se conserva). Devuelve la configuración completa ya validada. */
export const setAgentConfig = async (config) => (await call("/api/agente/config", { method: "POST", body: { config } })).config;

// ── Prospectos: contactos nuevos que escribieron por WhatsApp o Messenger ──
/** [{ clave: "wa:521…", canal, id, nombre, primerMensaje, at, importado }] del más nuevo al más viejo. */
export const listLeads = async () => (await call("/api/prospectos")).prospectos;
/** Marca prospectos (por su clave) como ya convertidos en clientes. */
export const markLeads = (ids, importado = true) => call("/api/prospectos/marcar", { method: "POST", body: { ids, importado } });

// ── Programador de publicaciones (Facebook e Instagram) ──
/** post: { texto, imagen (data URL, JPG para Instagram), cuando (ISO; si ya pasó, sale de inmediato), canales: ["facebook", "instagram"] } */
export const schedulePost = async (post) => (await call("/api/social/programar", { method: "POST", body: { post } })).item;
/** [{ id, texto, imagen (URL), cuando, canales, estado, intentos, resultados { facebook?, instagram? } }] */
export const listQueue = async () => (await call("/api/social/cola")).cola;
export const cancelPost = (id) => call("/api/social/cancelar", { method: "POST", body: { id } });

/** Descarga una foto/documento que el cliente mandó por WhatsApp. */
export async function downloadMedia(id) {
  const res = await call("/api/media", { params: { id } });
  return res.blob();
}

/** ¿Sigue abierta la ventana de 24 h de WhatsApp? (después solo se permiten plantillas aprobadas) */
export const windowOpen = (lastInAt) => Boolean(lastInAt && Date.now() - new Date(lastInAt).getTime() < 24 * 3600 * 1000);

/** Últimos 10 dígitos: para cruzar el número de WhatsApp con los clientes guardados. */
export const phoneKey = (p) => String(p ?? "").replace(/\D/g, "").slice(-10);
