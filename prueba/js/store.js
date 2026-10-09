// Estado de la app: un solo documento JSON (clientes, recordatorios, bitácora, ajustes) guardado en
// el dispositivo. Los archivos (INE, documentos) van aparte. Un servidor propio es OPCIONAL.
import { kvGet, kvSet, fileGet, filePut, fileDelete, fileKeys, clearAll } from "./db.js";
import { uid, blobToDataUrl, dataUrlToBlob } from "./util.js";

export const STAGES = [
  ["nuevo", "Nuevo"],
  ["seguimiento", "En seguimiento"],
  ["cotizacion", "Cotización"],
  ["credito", "Crédito"],
  ["vendido", "Vendido"],
  ["entregado", "Entregado"],
  ["perdido", "Perdido"],
];
export const stageLabel = (id) => STAGES.find((s) => s[0] === id)?.[1] ?? id;

export const PLATE_STATUS = [
  ["documentos", "Juntando documentos"],
  ["enviado", "Enviado a gestoría"],
  ["tramite", "En trámite"],
  ["listas", "Placas listas"],
  ["entregadas", "Entregadas al cliente"],
];
export const plateLabel = (id) => PLATE_STATUS.find((s) => s[0] === id)?.[1] ?? id;

export const DEFAULT_PLATE_REQS = [
  "Factura del vehículo",
  "INE del titular",
  "Comprobante de domicilio (máx. 3 meses)",
  "CURP",
  "Constancia de situación fiscal (RFC)",
  "Pago de derechos / control vehicular",
  "Carta poder (si no acude el titular)",
];

export const DEFAULT_TEMPLATES = [
  { id: "primer", title: "Primer contacto", text: "Hola {nombre}, soy {asesor} de {agencia}. Gracias por tu interés en el {auto}. ¿Te comparto precio y versiones, o prefieres agendar una prueba de manejo?" },
  { id: "seguimiento", title: "Seguimiento", text: "Hola {nombre}, soy {asesor} de {agencia}. Te escribo para dar seguimiento a tu interés en el {auto}. ¿Tienes alguna duda en la que te pueda ayudar?" },
  { id: "cotizacion", title: "Enviar cotización", text: "Hola {nombre}, te comparto la cotización del {auto}. Si gustas la revisamos juntos por llamada o en la agencia. ¿Qué día te acomoda?" },
  { id: "cita", title: "Confirmar cita", text: "Hola {nombre}, te confirmo nuestra cita {fecha} en {agencia}. ¿Seguimos en pie? Cualquier cambio, avísame por aquí." },
  { id: "documentos", title: "Documentos para crédito", text: "Hola {nombre}, para avanzar con tu solicitud de crédito necesito: INE vigente (frente y reverso), comprobante de domicilio reciente y tus últimos 3 comprobantes de ingresos. Por seguridad, te confirmo el medio para enviarlos." },
  { id: "credito", title: "Crédito en revisión", text: "Hola {nombre}, tu solicitud de crédito ya está en revisión. En cuanto tenga respuesta te aviso. ¿Hay algún horario en que prefieras que te llame?" },
  { id: "placas", title: "Estado de placas", text: "Hola {nombre}, te escribo sobre el trámite de placas de tu {auto}: {estado_placas}. Te aviso en cuanto haya novedades." },
  { id: "entrega", title: "Coordinar entrega", text: "Hola {nombre}, ¡tu {auto} está casi listo! Quisiera coordinar la entrega. ¿Qué día y horario te acomodan?" },
  { id: "reactivar", title: "Reactivar prospecto", text: "Hola {nombre}, soy {asesor} de {agencia}. Hace un tiempo platicamos sobre el {auto}. Este mes hay opciones que podrían interesarte. ¿Te gustaría que te cuente?" },
  { id: "gracias", title: "Agradecimiento", text: "Hola {nombre}, gracias por tu confianza en {agencia}. Cualquier cosa que necesites con tu {auto}, aquí estoy." },
];

const emptyState = () => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  settings: {
    advisorName: "",
    agency: "",
    advisorPhone: "",
    advisorEmail: "",
    platesEmail: "",
    platesRequirements: [...DEFAULT_PLATE_REQS],
    templates: DEFAULT_TEMPLATES.map((t) => ({ ...t })),
    ai: { enabled: false, apiKey: "", model: "claude-opus-5-5", ine: true },
    server: { url: "", token: "", auto: false, lastSync: null },
    google: { url: "", token: "", status: null },
    style: { myName: "", examples: [], notes: "", profile: null, analyzedAt: null },
    bankForms: {},
    feedbackTo: "",
    onboarded: false,
  },
  customers: [],
  activity: [],
  reminders: [],
  feedback: [],
  posts: [],
  waSeen: {},
  calTrash: [], // eventos de Google Calendar por borrar (recordatorios hechos o borrados)
});

export let state = emptyState();
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export async function load() {
  const saved = await kvGet("state");
  if (saved) {
    const base = emptyState();
    const ss = saved.settings ?? {};
    state = { ...base, ...saved, settings: { ...base.settings, ...ss, ai: { ...base.settings.ai, ...ss.ai }, server: { ...base.settings.server, ...ss.server }, google: { ...base.settings.google, ...ss.google }, style: { ...base.settings.style, ...ss.style }, bankForms: { ...ss.bankForms } } };
  }
  return state;
}

let saving = Promise.resolve();
export function save() {
  state.updatedAt = new Date().toISOString();
  const snapshot = structuredClone(state);
  saving = saving.then(() => kvSet("state", snapshot)).catch((e) => console.error("No se pudo guardar", e));
  for (const fn of listeners) fn();
  return saving;
}

// ───────── Clientes ─────────

export const customer = (id) => state.customers.find((c) => c.id === id);

export function addCustomer(data) {
  const now = new Date().toISOString();
  const c = { id: uid(), name: "", phone: "", email: "", vehicle: "", source: "", stage: "nuevo", nextFollowUp: null, notes: "", createdAt: now, updatedAt: now, credit: null, plates: null, ...data };
  state.customers.unshift(c);
  log(c.id, "alta", "Cliente registrado");
  save();
  return c;
}

export function updateCustomer(id, patch, { silent = false } = {}) {
  const c = customer(id);
  if (!c) return null;
  if (patch.stage && patch.stage !== c.stage) log(id, "etapa", `Etapa: ${stageLabel(c.stage)} → ${stageLabel(patch.stage)}`);
  Object.assign(c, patch, { updatedAt: new Date().toISOString() });
  if (!silent) save();
  return c;
}

export async function deleteCustomer(id) {
  const c = customer(id);
  if (!c) return;
  for (const f of customerFileIds(c)) await fileDelete(f).catch(() => {});
  state.customers = state.customers.filter((x) => x.id !== id);
  state.activity = state.activity.filter((a) => a.customerId !== id);
  state.reminders = state.reminders.filter((r) => r.customerId !== id);
  save();
}

function customerFileIds(c) {
  const ids = [];
  if (c.credit?.ineFront) ids.push(c.credit.ineFront);
  if (c.credit?.ineBack) ids.push(c.credit.ineBack);
  for (const v of Object.values(c.plates?.docs ?? {})) if (typeof v === "string") ids.push(v);
  return ids;
}

/** Bitácora del cliente: notas, WhatsApp, llamadas, correos, cambios. */
export function log(customerId, type, text) {
  state.activity.unshift({ id: uid(), customerId, type, text, at: new Date().toISOString() });
  if (state.activity.length > 3000) state.activity.length = 3000;
}
export const activityOf = (customerId) => state.activity.filter((a) => a.customerId === customerId);
export const lastContact = (customerId) => state.activity.find((a) => a.customerId === customerId && ["whatsapp", "llamada", "correo", "nota"].includes(a.type));

// ───────── Recordatorios ─────────

export function addReminder({ at, text, customerId = null, kind = "recordatorio" }) {
  const r = { id: uid(), notifId: Math.floor(Math.random() * 2_000_000_000), at: new Date(at).toISOString(), text, customerId, kind, done: false, createdAt: new Date().toISOString() };
  state.reminders.push(r);
  state.reminders.sort((a, b) => a.at.localeCompare(b.at));
  save();
  return r;
}
export function updateReminder(id, patch) {
  const r = state.reminders.find((x) => x.id === id);
  if (r) Object.assign(r, patch);
  if (r?.done && r.calendarId) { state.calTrash.push(r.calendarId); r.calendarId = null; }
  state.reminders.sort((a, b) => a.at.localeCompare(b.at));
  save();
  return r;
}
export function deleteReminder(id) {
  const r = state.reminders.find((x) => x.id === id);
  if (r?.calendarId) state.calTrash.push(r.calendarId);
  state.reminders = state.reminders.filter((x) => x.id !== id);
  save();
}
export const openReminders = () => state.reminders.filter((r) => !r.done);

/**
 * Programa el siguiente seguimiento de un cliente: guarda la fecha en la ficha y crea
 * (o mueve) su recordatorio de seguimiento. Así nunca hay dos seguimientos abiertos del mismo cliente.
 */
export function setFollowUp(customerId, at, text) {
  const c = customer(customerId);
  if (!c) return null;
  const existing = state.reminders.find((r) => r.customerId === customerId && r.kind === "seguimiento" && !r.done);
  if (!at) {
    if (existing) { existing.done = true; if (existing.calendarId) { state.calTrash.push(existing.calendarId); existing.calendarId = null; } }
    c.nextFollowUp = null;
    save();
    return null;
  }
  const iso = new Date(at).toISOString();
  c.nextFollowUp = iso;
  const label = text || "Dar seguimiento";
  if (existing) { existing.at = iso; existing.text = label; save(); return existing; }
  return addReminder({ at: iso, text: label, customerId, kind: "seguimiento" });
}

// ───────── Archivos ─────────

export async function saveFile(blob, name) {
  const id = uid();
  await filePut(id, { name, mime: blob.type || "application/octet-stream", blob });
  return id;
}
export const readFile = (id) => fileGet(id);
export const removeFile = (id) => fileDelete(id);

// ───────── Estilo de venta: mensajes reales del asesor ─────────

/** Guarda mensajes que el asesor escribió (para que la IA imite su estilo). */
export function learnFromAdvisor(texts, source = "app") {
  const st = state.settings.style;
  const seen = new Set(st.examples.map((e) => e.text));
  let added = 0;
  for (const raw of texts) {
    const text = String(raw ?? "").trim();
    if (text.length < 4 || text.length > 1200 || seen.has(text)) continue;
    if (/^<(Multimedia omitido|Media omitted)>$|^(imagen|video|audio|sticker) omitid/i.test(text)) continue;
    seen.add(text);
    st.examples.push({ text, source, at: new Date().toISOString() });
    added++;
  }
  if (st.examples.length > 1500) st.examples.splice(0, st.examples.length - 1500);
  return added;
}

// ───────── Comentarios (retroalimentación de la prueba) ─────────

export function addFeedback(screen, text) {
  state.feedback.unshift({ id: uid(), at: new Date().toISOString(), screen, text });
  save();
}

// ───────── Respaldo y servidor propio ─────────

export async function exportAll({ withFiles = true } = {}) {
  const files = {};
  if (withFiles) {
    for (const id of await fileKeys()) {
      const f = await fileGet(id);
      if (f?.blob) files[id] = { name: f.name, mime: f.mime, dataUrl: await blobToDataUrl(f.blob) };
    }
  }
  return { app: "sofia-prueba", version: 1, exportedAt: new Date().toISOString(), state, files };
}

export async function importAll(backup) {
  if (!backup || backup.app !== "sofia-prueba" || !backup.state) throw new Error("El archivo no es un respaldo de Sofía.");
  const keepServer = state.settings.server;
  const keepAi = state.settings.ai;
  const keepGoogle = state.settings.google;
  await clearAll();
  state = backup.state;
  // La conexión y la llave de IA son de este dispositivo: no se sobrescriben con las de otro.
  state.settings.server = keepServer;
  state.settings.ai = keepAi;
  state.settings.google = keepGoogle;
  for (const [id, f] of Object.entries(backup.files ?? {})) {
    await filePut(id, { name: f.name, mime: f.mime, blob: await dataUrlToBlob(f.dataUrl) });
  }
  await kvSet("state", structuredClone(state));
  for (const fn of listeners) fn();
}

export async function resetAll() {
  await clearAll();
  state = emptyState();
  await save();
}

/**
 * Servidor propio (opcional). Protocolo mínimo para que sirva cualquier backend:
 *   GET  <url>?token=…            → { updatedAt, backup } (o { backup: null })
 *   POST <url>  (text/plain JSON) → { token, backup }  → { ok: true, updatedAt }
 * text/plain evita la "preflight" de CORS: funciona con Google Apps Script y servidores simples.
 */
/** Dirección base del conector (sin /api/…). Una URL de Google Apps Script (…/exec) se usa tal cual. */
export function serverBase() {
  const url = (state.settings.server.url ?? "").trim();
  if (!url) return "";
  if (/\/exec\/?$/.test(url)) return url;
  return url.replace(/\/api\/datos\/?$/, "").replace(/\/+$/, "");
}
export const isAppsScript = () => /\/exec\/?$/.test(serverBase());

/** Dónde se respalda: el servidor (conector) si hay; si no, la cuenta de Google (mismo protocolo). */
function dataTarget() {
  const base = serverBase();
  if (base) return { base, token: state.settings.server.token, appsScript: isAppsScript() };
  const g = state.settings.google ?? {};
  if (g.url?.trim()) return { base: g.url.trim(), token: g.token, appsScript: true };
  return { base: "", token: "" };
}
export const backupReady = () => Boolean(dataTarget().base);

function serverUrl(withToken, extra = {}) {
  const { base, token, appsScript } = dataTarget();
  if (!base) throw new Error("Primero conecta tu servidor o tu cuenta de Google en Más → Conexiones.");
  const u = new URL(appsScript ? base : `${base}/api/datos`);
  if (withToken && token) u.searchParams.set("token", token);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return u.toString();
}

export async function serverPush() {
  const backup = await exportAll();
  backup.state = structuredClone(backup.state);
  backup.state.settings.ai = { ...backup.state.settings.ai, apiKey: "" }; // la llave de IA nunca sale del dispositivo
  // La clave de Google permite enviar correo desde el Gmail del asesor: tampoco viaja en respaldos.
  backup.state.settings.google = { ...backup.state.settings.google, token: "" };
  backup.state.settings.server = { ...backup.state.settings.server, token: "" };
  const res = await fetch(serverUrl(false), { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify({ token: dataTarget().token, backup }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) throw new Error(body.error || `El servidor respondió ${res.status}`);
  state.settings.server.lastSync = new Date().toISOString();
  await save();
  return body;
}

export async function serverPull() {
  const res = await fetch(serverUrl(true), { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) throw new Error(body.error || `El servidor respondió ${res.status}`);
  if (!body.backup) return { empty: true };
  await importAll(body.backup);
  state.settings.server.lastSync = new Date().toISOString();
  await save();
  return { empty: false, updatedAt: body.updatedAt };
}

export async function serverPeek() {
  const res = await fetch(serverUrl(true, { meta: "1" }), { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) throw new Error(body.error || `El servidor respondió ${res.status}`);
  return body; // { updatedAt }
}
