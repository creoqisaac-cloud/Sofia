// Conector de Sofía: núcleo independiente del hosting (solo Request/Response y Web Crypto estándar).
// Lo usan servidor.mjs (Node: tu PC, Render, Railway, VPS…) y cloudflare/worker.mjs (Cloudflare gratis).
//
// Hace de puente entre la app (que vive en el teléfono) y servicios que exigen un servidor:
//  - Datos:      respaldo/sincronización de la app.
//  - WhatsApp:   webhook oficial de Meta (mensajes entrantes con firma verificada), envío de texto y
//                plantillas por la API de WhatsApp Business (Cloud API), fotos/documentos recibidos.
//  - Messenger:  mensajes de la página de Facebook (mismo buzón).
//  - Facebook:   publicar en la página (texto o foto).
//  - Instagram:  publicar fotos en la cuenta profesional ligada a la página.
// Además trabaja SOLO, aunque la app esté cerrada, y SIN IA (reglas fijas, gratis):
//  - Vendedora:    asistente de ventas de autos (js/vendedor.js): inventario con foto y precio, cotización de
//                  crédito, cita para prueba de manejo y pase al asesor, con un menú por números.
//  - Agente:       o, si la vendedora está apagada, bienvenida, aviso de fuera de horario y reglas por palabra.
//  - Prospectos:   guarda a cada contacto nuevo para que la app lo convierta en cliente.
//  - Programador:  publica en Facebook/Instagram a la hora indicada (runScheduled, lo llama un temporizador).
// Los tokens de Meta viven SOLO aquí (variables de entorno/secretos), nunca en el teléfono.
//
// Variables: SOFIA_TOKEN (clave de la app) · META_APP_SECRET · META_VERIFY_TOKEN · WA_TOKEN ·
// WA_PHONE_NUMBER_ID · WA_WABA_ID · FB_PAGE_ID · FB_PAGE_TOKEN · IG_USER_ID (Instagram; usa FB_PAGE_TOKEN) ·
// PUBLIC_URL (dirección pública del conector, para que Instagram descargue las fotos) · META_GRAPH_URL (opcional) ·
// ANTHROPIC_API_KEY y ANTHROPIC_MODEL (opcionales: la IA de la vendedora, solo para lo que el menú no entiende).

import { decidir, VENTAS_BASE, contienePalabra, primerNombre, rellenar, promptIA, aplicarIA, ESQUEMA_IA, horariosLibres } from "../js/vendedor.js";

export const VERSION = "conector-1.2";
const MAX_MSGS = 500;

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
const fail = (error, status = 400) => json({ ok: false, error }, status);
/** Error de datos que mandó la app (responde 400, no 502). */
const invalido = (msg) => Object.assign(new Error(msg), { status: 400 });
/** El almacén puede no saber borrar (servidor.mjs): entonces se deja vacío. */
const borrar = (store, key) => (store.delete ? store.delete(key) : store.put(key, null));
/** Hora actual; las pruebas la fijan con handle(…, { ahora }). */
function ahoraDe(opciones) {
  const v = typeof opciones?.ahora === "function" ? opciones.ahora() : opciones?.ahora;
  return v ? new Date(v) : new Date();
}

const enc = new TextEncoder();
function sameSecret(a, b) {
  const x = enc.encode(String(a ?? ""));
  const y = enc.encode(String(b ?? ""));
  if (!y.length || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

async function hmacHex(secret, body) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ───────── Datos de Meta (y la IA del servidor) guardados desde la app ─────────
// conexion:meta → { WA_TOKEN, WA_PHONE_NUMBER_ID, … } Lo que se guarda aquí manda sobre las variables del servidor,
// así se configura todo desde Más → Conexiones sin volver a desplegar. La app nunca lo vuelve a leer: solo ve si está.
const DESDE_APP = {
  WA_TOKEN: /^\S{20,600}$/, WA_PHONE_NUMBER_ID: /^\d{1,25}$/, WA_WABA_ID: /^\d{1,25}$/, META_APP_SECRET: /^[a-f0-9]{16,64}$/i,
  META_VERIFY_TOKEN: /^[\w.-]{6,100}$/, FB_PAGE_ID: /^\d{1,25}$/, FB_PAGE_TOKEN: /^\S{20,600}$/, IG_USER_ID: /^\d{1,25}$/,
  ASESOR_WHATSAPP: /^\d{10,15}$/, ANTHROPIC_API_KEY: /^sk-ant-\S{10,300}$/, ANTHROPIC_MODEL: /^claude-[a-z0-9-]{2,60}$/, PUBLIC_URL: /^https:\/\/[^\s/?#]+(\/[^\s?#]*)?$/,
};
const SECRETOS = new Set(["WA_TOKEN", "META_APP_SECRET", "FB_PAGE_TOKEN", "ANTHROPIC_API_KEY"]);

async function conConexion(env, store) {
  const d = (await store.get("conexion:meta")) ?? {};
  const extra = Object.fromEntries(Object.keys(DESDE_APP).filter((k) => typeof d[k] === "string" && d[k]).map((k) => [k, d[k]]));
  return Object.keys(extra).length ? { ...env, ...extra } : env;
}

/** Guarda lo que mande la app (vacío = borrar ese dato). Si nadie definió el token de verificación, se inventa uno. */
async function guardarConexion(env, store, datos) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) throw invalido("Faltan los datos");
  const actual = (await store.get("conexion:meta")) ?? {};
  for (const [k, v] of Object.entries(datos)) {
    if (!Object.hasOwn(DESDE_APP, k)) throw invalido(`Dato desconocido: ${k}`);
    const t = String(v ?? "").trim().replace(/\/+$/, "");
    if (!t) { delete actual[k]; continue; }
    if (!DESDE_APP[k].test(t)) throw invalido(`${k} no tiene el formato esperado`);
    actual[k] = t;
  }
  if (!actual.META_VERIFY_TOKEN && !env.META_VERIFY_TOKEN) actual.META_VERIFY_TOKEN = `sofia-${nuevoId().slice(0, 16)}`;
  await store.put("conexion:meta", actual);
}

/** Qué datos hay (y de dónde), sin devolver nunca un secreto; más lo que hay que pegar en Meta. */
async function vistaConexion(env, store, base) {
  const d = (await store.get("conexion:meta")) ?? {};
  const efectivo = await conConexion(env, store);
  const configurado = Object.fromEntries(Object.keys(DESDE_APP).map((k) => [k, d[k] ? "app" : env[k] ? "servidor" : null]));
  const visibles = Object.fromEntries(Object.keys(DESDE_APP).filter((k) => !SECRETOS.has(k) && efectivo[k]).map((k) => [k, efectivo[k]]));
  return { configurado, valores: visibles, webhook: { url: `${publicBase(efectivo, base)}/webhook/meta`, verifyToken: efectivo.META_VERIFY_TOKEN ?? null } };
}

const graphUrl = (env) => (env.META_GRAPH_URL || "https://graph.facebook.com/v23.0").replace(/\/+$/, "");
const waReady = (env) => Boolean(env.WA_TOKEN && env.WA_PHONE_NUMBER_ID);
const fbReady = (env) => Boolean(env.FB_PAGE_ID && env.FB_PAGE_TOKEN);
const igReady = (env) => Boolean(env.IG_USER_ID && env.FB_PAGE_TOKEN);

async function graph(env, path, { method = "GET", token, body, form } = {}) {
  const res = await fetch(`${graphUrl(env)}/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    throw new Error(e.error_user_msg || e.message || `Meta respondió ${res.status}`);
  }
  return data;
}

// ───────── Buzón (WhatsApp y Messenger) ─────────
// inbox:index           → { "<canal>:<id>": { channel, id, name, lastAt, lastText, lastDir, lastInAt, count,
//                           lastManualAt?, autoAt? { <huella de la respuesta automática>: fecha } } }
// inbox:c:<canal>:<id>  → [ { id, dir: "in"|"out", type, text, at, media?, status?, auto? } ]

const DIA_MS = 24 * 3600 * 1000;

/** Solo las marcas de respuestas automáticas de los últimos 30 días (esperaHoras no pasa de 720). */
const marcasRecientes = (marcas, hasta) => Object.fromEntries(Object.entries(marcas ?? {}).filter(([, at]) => new Date(hasta) - new Date(at) < 30 * DIA_MS));

/**
 * Guarda un mensaje en su conversación. Devuelve null si ya existía (Meta reintenta: no duplicar)
 * o { prev } con lo que había de esa conversación ANTES de este mensaje (null = primer contacto).
 * autoKey: huella de la respuesta automática enviada (para no repetirla antes de esperaHoras).
 * extra: datos que se guardan junto a la conversación (p. ej. venta: lo que recuerda la vendedora).
 */
async function addMessage(store, channel, peer, name, msg, autoKey, extra) {
  const key = `${channel}:${peer}`;
  const list = (await store.get(`inbox:c:${key}`)) ?? [];
  if (msg.id && list.some((m) => m.id === msg.id)) return null;
  list.push(msg);
  if (list.length > MAX_MSGS) list.splice(0, list.length - MAX_MSGS);
  await store.put(`inbox:c:${key}`, list);
  const index = (await store.get("inbox:index")) ?? {};
  const prev = index[key] ?? null;
  const base = prev ?? { channel, id: peer, count: 0 };
  index[key] = {
    ...base,
    name: name || base.name || "",
    lastAt: msg.at,
    lastText: msg.text || (msg.media ? `[${msg.type}]` : ""),
    lastDir: msg.dir,
    lastInAt: msg.dir === "in" ? msg.at : base.lastInAt ?? null,
    count: base.count + 1,
    ...(msg.dir === "out" && !msg.auto ? { lastManualAt: msg.at } : {}),
    ...(autoKey ? { autoAt: marcasRecientes({ ...base.autoAt, [autoKey]: msg.at }, msg.at) } : {}),
    ...(extra ?? {}),
  };
  await store.put("inbox:index", index);
  return { prev };
}

// Meta manda sent → delivered → read (a veces en desorden). "failed" y otros no tienen orden: se guardan siempre.
const ORDEN_ESTADO = { sent: 1, delivered: 2, read: 3 };

async function setStatus(store, channel, peer, id, status) {
  const k = `inbox:c:${channel}:${peer}`;
  const list = await store.get(k);
  const m = list?.find((x) => x.id === id);
  // Sin cambio, o un "delivered" que llega después del "read": no se reescribe (cuida el límite de KV).
  if (!m || m.status === status || ORDEN_ESTADO[status] < ORDEN_ESTADO[m.status]) return;
  m.status = status;
  await store.put(k, list);
}

function waText(m) {
  switch (m.type) {
    case "text": return m.text?.body ?? "";
    case "image": case "video": case "document": case "audio": case "sticker": return m[m.type]?.caption ?? "";
    case "button": return m.button?.text ?? "";
    case "interactive": return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
    case "location": return `📍 ${m.location?.latitude},${m.location?.longitude}`;
    case "reaction": return m.reaction?.emoji ?? "";
    default: return `[${m.type}]`;
  }
}

// ───────── Agente sin IA: respuestas automáticas por reglas ─────────
// agente:config   → ver AGENTE_BASE (la app lo edita con /api/agente/config)
// agente:errores  → [ { at, canal, id, error } ]  últimos envíos automáticos que fallaron
//
// Por cada mensaje entrante NUEVO se elige, en este orden, la primera respuesta que no se le haya
// mandado a ese contacto en las últimas esperaHoras: bienvenida (primer contacto) → fuera de horario →
// reglas por palabra. Nunca más de una respuesta automática por mensaje.

// De fábrica: la Sofía de Mario en Honda, contestando sola y con IA (gratis de Cloudflare) sin configurar nada.
const AGENTE_BASE = {
  activo: true,
  zonaHoraria: "America/Monterrey",
  horario: { dias: [1, 2, 3, 4, 5, 6], inicio: "09:00", fin: "19:00" }, // 0 = domingo, 1 = lunes … 6 = sábado
  bienvenida: "¡Hola {nombre}! Gracias por escribir. En un momento te atiendo.",
  fueraDeHorario: "¡Hola {nombre}! Gracias por tu mensaje. En este momento estoy fuera de horario; te contesto en cuanto regrese.",
  reglas: [], // [ { palabras: ["precio", "cuánto cuesta"], respuesta: "…" } ]
  esperaHoras: 12, // no repetir la misma respuesta automática al mismo contacto antes de N horas
  pausaMinutos: 30, // si el asesor contestó a mano hace menos de N minutos, el agente no interrumpe
  asesor: "Mario",
  agencia: "Honda",
  marca: "Honda",
  ventas: { ...VENTAS_BASE, ia: true }, // vendedora (agenda citas); apagada = solo lo de arriba
  estilo: { ejemplos: [], notas: "" }, // cómo escribe el asesor: con IA, Sofía habla como él
};
const MAX_REGLAS = 50;
const MAX_TEXTO_AUTO = 1000;
// Con 0 horas, dos contestadores automáticos (el nuestro y el de otro negocio) se responderían sin fin.
const MIN_ESPERA_HORAS = 1;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
// Tipos de mensaje que no llevan respuesta (reacciones, avisos del sistema, mensajes que WhatsApp no soporta).
const SIN_RESPUESTA = new Set(["reaction", "system", "unsupported", "errors", "ephemeral"]);
const DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function zonaValida(zona) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: zona }); return true; } catch { return false; }
}

function textoAuto(v, campo) {
  const t = String(v ?? "").trim();
  if (t.length > MAX_TEXTO_AUTO) throw invalido(`${campo}: máximo ${MAX_TEXTO_AUTO} caracteres`);
  return t;
}

function numeroEntre(v, porDefecto, min, max) {
  const n = Number(v ?? porDefecto);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.max(n, min), max) : porDefecto;
}

/** Valida y completa la configuración que manda la app (lo que falte queda como estaba). */
function normalizarConfig(c) {
  const h = { ...AGENTE_BASE.horario, ...(c.horario ?? {}) };
  if (!HORA.test(h.inicio) || !HORA.test(h.fin)) throw invalido("El horario va como HH:MM, por ejemplo 09:00 y 19:00");
  if (!Array.isArray(h.dias)) throw invalido("Los días del horario deben ser una lista");
  const numeros = h.dias.map((d) => (/^\s*[0-7]\s*$/.test(String(d)) ? Number(d) % 7 : NaN)); // 7 también es domingo
  if (numeros.some(Number.isNaN)) throw invalido("Los días del horario van del 0 (domingo) al 6 (sábado)");
  const dias = [...new Set(numeros)].sort((a, b) => a - b);
  const zonaHoraria = String(c.zonaHoraria || AGENTE_BASE.zonaHoraria);
  if (!zonaValida(zonaHoraria)) throw invalido(`Zona horaria desconocida: ${zonaHoraria}`);
  if (!Array.isArray(c.reglas)) throw invalido("Las reglas deben ser una lista");
  if (c.reglas.length > MAX_REGLAS) throw invalido(`Máximo ${MAX_REGLAS} reglas`);
  const reglas = c.reglas.map((r, i) => {
    const palabras = (Array.isArray(r?.palabras) ? r.palabras : String(r?.palabras ?? "").split(",")).map((p) => String(p).trim()).filter(Boolean);
    const respuesta = textoAuto(r?.respuesta, `Regla ${i + 1}`);
    if (!palabras.length || !respuesta) throw invalido(`La regla ${i + 1} necesita palabras y respuesta`);
    return { palabras, respuesta };
  });
  return {
    activo: Boolean(c.activo),
    zonaHoraria,
    horario: { dias, inicio: h.inicio, fin: h.fin },
    bienvenida: textoAuto(c.bienvenida, "Bienvenida"),
    fueraDeHorario: textoAuto(c.fueraDeHorario, "Fuera de horario"),
    reglas,
    esperaHoras: numeroEntre(c.esperaHoras, AGENTE_BASE.esperaHoras, MIN_ESPERA_HORAS, 720),
    pausaMinutos: numeroEntre(c.pausaMinutos, AGENTE_BASE.pausaMinutos, 0, 1440),
    asesor: String(c.asesor ?? "").trim().slice(0, 80),
    agencia: String(c.agencia ?? "").trim().slice(0, 80),
    marca: String(c.marca ?? AGENTE_BASE.marca).trim().slice(0, 40) || AGENTE_BASE.marca,
    ventas: normalizarVentas(c.ventas),
    estilo: normalizarEstilo(c.estilo),
  };
}

/** Cómo escribe el asesor (mensajes reales suyos de «Mi estilo de venta»), para que Sofía hable como él. */
function normalizarEstilo(e = {}) {
  const ejemplos = (Array.isArray(e?.ejemplos) ? e.ejemplos : []).map((x) => String(x ?? "").trim().slice(0, 300)).filter((x) => x.length >= 3).slice(0, 40);
  return { ejemplos, notas: String(e?.notas ?? "").trim().slice(0, 600) };
}

function normalizarVentas(v = {}) {
  const b = AGENTE_BASE.ventas;
  const entre = (x, porDefecto, min, max) => { const n = Number(x ?? porDefecto); return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : porDefecto; };
  const plazos = Array.isArray(v.plazos) ? [...new Set(v.plazos.map(Number).filter((n) => Number.isInteger(n) && n >= 6 && n <= 96))].sort((x, y) => x - y).slice(0, 6) : b.plazos;
  return {
    activo: v.activo === undefined ? b.activo : Boolean(v.activo),
    tasaAnual: Math.round(entre(v.tasaAnual, b.tasaAnual, 0, 80) * 100) / 100,
    engancheMinimo: entre(v.engancheMinimo, b.engancheMinimo, 0, 90),
    plazos: plazos.length ? plazos : b.plazos,
    horasConAsesor: entre(v.horasConAsesor, b.horasConAsesor, 0, 168),
    presentacion: textoAuto(v.presentacion, "Presentación"),
    ia: v.ia === undefined ? b.ia : Boolean(v.ia),
  };
}

async function leerConfig(store) {
  let c = await store.get("agente:config");
  // Configuración guardada antes de la Sofía de Mario en Honda (no trae «marca»): pasa a la nueva forma de trabajar,
  // contestando sola y con IA, con Mario y Honda donde estaba vacío.
  if (c && !c.marca) c = { ...c, activo: true, asesor: c.asesor || AGENTE_BASE.asesor, agencia: c.agencia || AGENTE_BASE.agencia, marca: AGENTE_BASE.marca, ventas: { ...(c.ventas ?? {}), activo: true, ia: true } };
  return { ...AGENTE_BASE, ...(c ?? {}), horario: { ...AGENTE_BASE.horario, ...(c?.horario ?? {}) }, ventas: { ...AGENTE_BASE.ventas, ...(c?.ventas ?? {}) } };
}

/** ¿La hora dada cae dentro del horario de atención, en la zona horaria de la agencia? */
function enHorario(cfg, ahora) {
  let partes;
  try {
    partes = new Intl.DateTimeFormat("en-US", { timeZone: cfg.zonaHoraria, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ahora);
  } catch { return true; } // zona inválida: mejor no avisar "fuera de horario" por error
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  const { dias, inicio, fin } = cfg.horario;
  if (!dias.includes(DIAS[p.weekday])) return false;
  const hhmm = `${p.hour}:${p.minute}`;
  if (inicio === fin) return true; // todo el día
  return inicio < fin ? hhmm >= inicio && hhmm < fin : hhmm >= inicio || hhmm < fin; // turno que cruza la medianoche
}

/** Huella corta de una respuesta (FNV-1a): identifica "la misma respuesta" aunque cambie el orden de las reglas. */
function huella(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

function elegirRespuesta(cfg, e, ahora) {
  const candidatas = [];
  if (e.primero && cfg.bienvenida) candidatas.push(cfg.bienvenida);
  if (cfg.fueraDeHorario && !enHorario(cfg, ahora)) candidatas.push(cfg.fueraDeHorario);
  for (const r of cfg.reglas) if (r.palabras.some((p) => contienePalabra(e.texto, p))) candidatas.push(r.respuesta);
  const espera = Math.max(Number(cfg.esperaHoras) || 0, MIN_ESPERA_HORAS) * 3600 * 1000;
  return candidatas.find((t) => {
    const antes = e.prev?.autoAt?.[huella(t)];
    return !antes || ahora - new Date(antes) >= espera;
  });
}

/**
 * Contesta solo, si toca. Devuelve true si intentó mandar una respuesta.
 * Un envío fallido se anota en agente:errores y NO rompe el webhook (Meta debe recibir 200).
 */
async function responderSolo(env, store, cfg, e, ahora) {
  if (!cfg.activo) return false;
  if (ahora - new Date(e.at) > DIA_MS) return false; // mensaje viejo (Meta lo reenvió tarde): ya no se contesta
  const pausa = cfg.pausaMinutos * 60 * 1000;
  if (pausa && e.prev?.lastManualAt && ahora - new Date(e.prev.lastManualAt) < pausa) return false;
  const plantilla = elegirRespuesta(cfg, e, ahora);
  if (!plantilla) return false;
  const text = rellenar(plantilla, { nombre: primerNombre(e.nombre), asesor: cfg.asesor, agencia: cfg.agencia || "la agencia" }); // sin nombre: "Estamos en la agencia.", no "Estamos en."
  if (!text) return false;
  try {
    await sendMessage(env, store, { channel: e.canal, to: e.id, text }, { ahora, autoKey: huella(plantilla) });
  } catch (err) {
    const errores = (await store.get("agente:errores")) ?? [];
    errores.unshift({ at: ahora.toISOString(), canal: e.canal, id: e.id, error: err.message ?? String(err) });
    await store.put("agente:errores", errores.slice(0, 20));
  }
  return true;
}

// ───────── Vendedora: asistente de ventas de autos (sin IA) ─────────
// ventas:inventario → [ { id, marca, modelo, version, anio, precio, tipo, km, color, transmision, descripcion,
//                        palabras, disponible, fotoId? } ]  (lo manda la app; la foto vive en media:<fotoId>)
// inbox:index[clave].venta → lo que Sofía recuerda de esa conversación (paso, auto elegido, opciones del menú…)

const MAX_AUTOS = 200;
const MAX_FOTO_AUTO = 5 * 1024 * 1024; // límite de WhatsApp para imágenes

/**
 * Contesta como vendedora (js/vendedor.js), si toca. Devuelve true si intentó mandar algo.
 * Las fotos del inventario solo se mandan con una dirección pública HTTPS (Meta las descarga de ahí).
 */
async function responderVentas(env, store, cfg, e, ahora, base) {
  if (!cfg.activo) return false;
  if (ahora - new Date(e.at) > DIA_MS) return false; // mensaje viejo (Meta lo reenvió tarde): ya no se contesta
  const pausa = cfg.pausaMinutos * 60 * 1000;
  if (pausa && e.prev?.lastManualAt && ahora - new Date(e.prev.lastManualAt) < pausa) return false;
  const inventario = await inventarioVendedora(store, publicBase(env, base), true);
  const historial = async () => ((await store.get(`inbox:c:${e.canal}:${e.id}`)) ?? []).map((m) => ({ dir: m.dir, text: m.text }));
  const libres = await libresDe(store, cfg, ahora);
  const r = await pensarVenta(env, cfg, inventario, e.prev?.venta ?? {}, { texto: e.texto, nombre: e.nombre, primero: e.primero }, historial, ahora, libres);
  if (r.errorIA) await anotarError(store, e, `IA: ${r.errorIA}`, ahora);
  if (Object.keys(r.lead).length) await actualizarLead(store, e, r.lead, ahora);
  if (r.reserva) await apartarCita(env, store, cfg, e, r, ahora);
  await avisarSiToca(env, store, cfg, e, r, ahora);
  for (const [i, m] of r.respuestas.entries()) {
    try {
      await sendMessage(env, store, { channel: e.canal, to: e.id, text: m.texto, ...(m.foto ? { image: m.foto } : {}) },
        { ahora, autoKey: `venta:${r.motivo}`, indice: i === r.respuestas.length - 1 ? { venta: r.conv } : undefined });
    } catch (err) {
      await anotarError(store, e, err.message ?? String(err), ahora);
      break;
    }
  }
  return r.respuestas.length > 0;
}

/** Inventario para la vendedora, con la foto como URL pública (WhatsApp solo descarga de HTTPS). */
async function inventarioVendedora(store, pub, soloHttps) {
  const ok = !soloHttps || pub.startsWith("https://");
  return ((await store.get("ventas:inventario")) ?? []).map((a) => ({ ...a, foto: a.fotoId && ok ? `${pub}/media/${a.fotoId}` : null }));
}

// ───────── Agenda de citas ─────────
// agenda:citas → [ { id (ISO del inicio), canal, cliente, nombre, interes, resumen, creada, estado: "apartada"|"cancelada" } ]

async function citasActivas(store, ahora) {
  return ((await store.get("agenda:citas")) ?? []).filter((x) => x.estado !== "cancelada" && new Date(x.id) > ahora - 2 * 3600 * 1000);
}

/** Horarios libres de los próximos días según el horario de la agencia y lo ya apartado. */
async function libresDe(store, cfg, ahora) {
  const ocupadas = (await citasActivas(store, ahora)).map((x) => x.id);
  return horariosLibres({ horario: cfg.horario, zonaHoraria: cfg.zonaHoraria, ocupadas, ahora });
}

/** Aparta el horario (si nadie lo tomó en el inter) y le avisa al asesor por WhatsApp si dejó su número. */
async function apartarCita(env, store, cfg, e, r, ahora) {
  const citas = (await store.get("agenda:citas")) ?? [];
  if (citas.some((x) => x.id === r.reserva.id && x.estado !== "cancelada")) return false;
  const lead = ((await store.get("leads:index")) ?? {})[`${e.canal}:${e.id}`] ?? {};
  const cita = { id: r.reserva.id, texto: r.reserva.texto, canal: e.canal, cliente: e.id, nombre: lead.nombreCliente || e.nombre || "", interes: lead.interes ?? "", resumen: lead.resumen ?? "", creada: ahora.toISOString(), estado: "apartada" };
  // Se libera el horario que tenía antes este mismo cliente (si cambió la cita).
  for (const x of citas) if (x.canal === e.canal && x.cliente === e.id && x.estado === "apartada") x.estado = "cancelada";
  citas.push(cita);
  await store.put("agenda:citas", citas.filter((x) => new Date(x.id) > ahora - 30 * DIA_MS).slice(-500));
  return true;
}

/**
 * El aviso al asesor sale una vez por cita, cuando ya hay con qué: el nombre del cliente o el pase al asesor.
 * Lleva lo último que Sofía sabe (modelo, resumen).
 */
async function avisarSiToca(env, store, cfg, e, r, ahora) {
  const citas = (await store.get("agenda:citas")) ?? [];
  const cita = citas.find((x) => x.canal === e.canal && x.cliente === e.id && x.estado === "apartada" && !x.avisada);
  if (!cita) return;
  const lead = ((await store.get("leads:index")) ?? {})[`${e.canal}:${e.id}`] ?? {};
  if (!lead.nombreCliente && !r.lead.quiereAsesor) return;
  Object.assign(cita, { nombre: lead.nombreCliente || cita.nombre, interes: lead.interes || cita.interes, resumen: lead.resumen || cita.resumen, avisada: true });
  await store.put("agenda:citas", citas);
  await avisarAsesor(env, store, cfg, e, cita, ahora);
}

/** WhatsApp al asesor con el contexto del cliente (ASESOR_WHATSAPP en Conexiones). Si Meta no lo deja, queda en errores. */
async function avisarAsesor(env, store, cfg, e, cita, ahora) {
  const numero = String(env.ASESOR_WHATSAPP ?? "").replace(/\D/g, "");
  if (!numero || !waReady(env)) return;
  const tel = e.canal === "wa" ? `\nWhatsApp: https://wa.me/${e.id}` : "";
  const texto = `📅 Sofía te agendó una cita\n${cita.nombre || "Cliente"} · ${cita.texto}${cita.interes ? `\nLe interesa: ${cita.interes}` : ""}${cita.resumen ? `\n${cita.resumen}` : ""}${tel}`;
  try {
    await sendMessage(env, store, { channel: "wa", to: numero.length === 10 ? `52${numero}` : numero, text: texto }, { ahora });
  } catch (err) {
    await anotarError(store, e, `Aviso a ${cfg.asesor || "el asesor"}: ${err.message ?? err} (Meta solo deja escribirle si él le mandó un mensaje al número de Sofía en las últimas 24 h)`, ahora);
  }
}

// Lo que el menú resuelve siempre él mismo, aun con IA: el freno contra bucles, el silencio mientras atiende el
// asesor, mensajes sin texto y los derechos del aviso de privacidad.
const SIN_IA = new Set(["freno", "con-asesor", "vacio", "borrar-datos", "sin-promociones"]);

/**
 * Sin IA, contesta el menú. Con IA, Sofía lleva toda la plática como vendedora (el menú queda de respaldo: si la IA
 * falla, va lo del menú y el error regresa en errorIA). historial: función que trae la conversación.
 */
async function pensarVenta(env, cfg, inventario, antes, msg, historial, ahora, libres = []) {
  const r = decidir({ cfg, inventario, conv: antes, msg: { ...msg, enHorario: enHorario(cfg, ahora) }, ahora, libres });
  if (SIN_IA.has(r.motivo) || !cfg.ventas.ia || !motorIA(env)) return r;
  try {
    return aplicarIA(r, await preguntarIA(env, promptIA({ cfg, inventario, historial: await historial(), libres })), { inventario, antes, ahora, libres });
  } catch (err) {
    return { ...r, errorIA: err.message ?? String(err) };
  }
}

/** Lo que falló al contestar solo queda en agente:errores (la app muestra el último). */
async function anotarError(store, e, error, ahora) {
  const errores = (await store.get("agente:errores")) ?? [];
  errores.unshift({ at: ahora.toISOString(), canal: e.canal, id: e.id, error });
  await store.put("agente:errores", errores.slice(0, 20));
}

export const MODELO_IA = "claude-opus-5-5";
const CON_RESPALDO = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-fable-5-1"]);

/**
 * Una respuesta de Claude con salida estructurada (ESQUEMA_IA) y el mismo SDK que usa la app (vendor/).
 * Esfuerzo bajo: son mensajes cortos de WhatsApp. Sin reintentos y con tiempo límite, porque Meta espera
 * respuesta del webhook. Si Claude rechaza, se usa otro modelo automáticamente (fallbacks) cuando aplica.
 */
async function preguntarClaude(env, { system, messages }) {
  const sdk = await import("../vendor/anthropic-sdk.mjs");
  const cliente = new sdk.default({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: 15_000, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
  const model = env.ANTHROPIC_MODEL || MODELO_IA;
  const params = { model, max_tokens: 16000, system, messages, output_config: { effort: "low", format: sdk.jsonSchemaOutputFormat(ESQUEMA_IA) } };
  if (CON_RESPALDO.has(model)) Object.assign(params, { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  const res = await cliente.beta.messages.create(params);
  if (res.stop_reason === "refusal") throw new Error("Claude no quiso contestar ese mensaje");
  if (res.stop_reason === "max_tokens") throw new Error("respuesta incompleta");
  return JSON.parse(res.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

// IA GRATIS: Workers AI de Cloudflare (enlace "AI" en el Worker), con su cuota diaria sin costo. Se usa cuando no
// hay llave de Claude. Habla bien español aunque menos natural que Claude.
export const MODELO_GRATIS = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** El primer objeto JSON de un texto (los modelos abiertos a veces agregan algo antes o después). */
function leerJson(texto) {
  const t = String(texto ?? "");
  try { return JSON.parse(t); } catch { /* sigue */ }
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("la IA no contestó en el formato esperado");
  return JSON.parse(t.slice(a, b + 1));
}

async function preguntarCloudflare(env, { system, messages }) {
  const formato = `\n\nContesta SOLO con un objeto JSON con estas llaves: ${Object.entries(ESQUEMA_IA.properties).map(([k, v]) => `${k} (${v.description})`).join("; ")}.`;
  const llamada = env.AI.run(env.CF_AI_MODEL || MODELO_GRATIS, {
    messages: [{ role: "system", content: system + formato }, ...messages],
    response_format: { type: "json_schema", json_schema: ESQUEMA_IA },
    max_tokens: 800,
    temperature: 0.7,
  });
  const res = await Promise.race([llamada, new Promise((_, no) => setTimeout(() => no(new Error("la IA de Cloudflare tardó demasiado")), 20_000))]);
  const r = res?.response ?? res;
  return r && typeof r === "object" ? r : leerJson(r);
}

/** Motor de IA disponible: Claude si hay llave; si no, la IA gratis de Cloudflare si el Worker la tiene enlazada. */
const motorIA = (env) => (env.ANTHROPIC_API_KEY ? "claude" : typeof env.AI?.run === "function" ? "cloudflare" : null);

async function preguntarIA(env, prompt) {
  if (!prompt.messages.length) throw new Error("sin mensajes del cliente");
  const motor = motorIA(env);
  if (motor === "claude") return preguntarClaude(env, prompt);
  if (motor === "cloudflare") return preguntarCloudflare(env, prompt);
  throw new Error("no hay IA conectada en el servidor");
}

/** Lo que el cliente fue diciendo (auto, crédito, enganche, cita…) se guarda en su prospecto para la app. */
async function actualizarLead(store, e, cambios, ahora) {
  const leads = (await store.get("leads:index")) ?? {};
  const clave = `${e.canal}:${e.id}`;
  const l = Object.hasOwn(leads, clave) ? leads[clave] : { canal: e.canal, id: e.id, nombre: e.nombre || "", primerMensaje: String(e.texto ?? "").slice(0, 300), at: ahora.toISOString(), importado: false };
  Object.assign(l, cambios, { actualizado: ahora.toISOString() });
  // Pide cita o asesor: vuelve a "nuevos" aunque ya se hubiera agregado como cliente (la app lo avisa).
  if (cambios.cita || cambios.quiereAsesor) { l.importado = false; delete l.importadoAt; }
  leads[clave] = l;
  await store.put("leads:index", leads);
}

/** La app manda su inventario completo; las fotos que ya nadie usa se borran. */
async function guardarInventario(store, autos) {
  if (!Array.isArray(autos)) throw invalido("Falta el inventario (autos)");
  if (autos.length > MAX_AUTOS) throw invalido(`Máximo ${MAX_AUTOS} autos`);
  const txt = (x, max = 80) => String(x ?? "").trim().slice(0, max);
  const num = (x) => { const n = Number(String(x ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : 0; };
  const limpio = autos.map((a) => {
    if (!a || typeof a !== "object") throw invalido("Auto inválido");
    const id = txt(a.id, 40);
    if (!/^[\w-]+$/.test(id)) throw invalido("Cada auto necesita un id");
    if (!txt(a.modelo) && !txt(a.marca)) throw invalido("Cada auto necesita marca o modelo");
    return {
      id, marca: txt(a.marca), modelo: txt(a.modelo), version: txt(a.version), anio: num(a.anio) || "",
      precio: num(a.precio), tipo: a.tipo === "seminuevo" ? "seminuevo" : "nuevo", km: num(a.km),
      color: txt(a.color), transmision: txt(a.transmision), descripcion: txt(a.descripcion, 400),
      palabras: (Array.isArray(a.palabras) ? a.palabras : String(a.palabras ?? "").split(",")).map((x) => txt(x, 40)).filter(Boolean).slice(0, 10),
      disponible: a.disponible !== false,
      ...(MEDIA_ID.test(a.fotoId ?? "") ? { fotoId: a.fotoId } : {}),
    };
  });
  const antes = (await store.get("ventas:inventario")) ?? [];
  const usadas = new Set(limpio.map((a) => a.fotoId).filter(Boolean));
  for (const a of antes) if (a.fotoId && !usadas.has(a.fotoId)) await borrar(store, `media:${a.fotoId}`);
  await store.put("ventas:inventario", limpio);
  return limpio;
}

const vistaAuto = (a, base) => ({ ...a, foto: a.fotoId ? `${base}/media/${a.fotoId}` : null });

// ───────── Prospectos ─────────
// leads:index → { "<canal>:<id>": { canal, id, nombre, primerMensaje, at, importado, importadoAt? } }
// Se crea con el PRIMER mensaje de un contacto que el conector no conocía; la app lo convierte en cliente
// y lo marca como importado (/api/prospectos/marcar).

const MAX_LEADS = 1000;

async function addLead(store, canal, id, nombre, msg) {
  const leads = (await store.get("leads:index")) ?? {};
  const clave = `${canal}:${id}`;
  if (leads[clave]) return;
  leads[clave] = { canal, id, nombre: nombre || "", primerMensaje: (msg.text || (msg.media ? `[${msg.type}]` : "")).slice(0, 300), at: msg.at, importado: false };
  const claves = Object.keys(leads);
  if (claves.length > MAX_LEADS) {
    // Si crece demasiado se olvidan primero los ya importados y, entre ellos, los más viejos.
    const orden = claves.sort((a, b) => Number(leads[b].importado) - Number(leads[a].importado) || leads[a].at.localeCompare(leads[b].at));
    for (const k of orden.slice(0, claves.length - MAX_LEADS)) delete leads[k];
  }
  await store.put("leads:index", leads);
}

/** Messenger no manda el nombre en el webhook: se pide una vez, en el primer contacto. */
async function nombreMessenger(env, store, psid) {
  if (!fbReady(env)) return "";
  const prev = ((await store.get("inbox:index")) ?? {})[`fb:${psid}`];
  if (prev) return prev.name ?? "";
  try {
    const p = await graph(env, `${encodeURIComponent(psid)}?fields=first_name,last_name`, { token: env.FB_PAGE_TOKEN });
    return [p.first_name, p.last_name].filter(Boolean).join(" ");
  } catch { return ""; } // sin permiso o perfil privado: se queda sin nombre
}

/** Fecha que manda Meta (en milisegundos); si viene vacía o mal, la hora de llegada (el webhook nunca debe tronar). */
function fechaMeta(ms, ahora) {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? ahora.toISOString() : d.toISOString();
}

const AVISO_MS = 10 * 60 * 1000; // webhook:last se reescribe como mucho cada 10 min

async function handleWebhook(req, env, store, ahora) {
  const raw = new Uint8Array(await req.arrayBuffer());
  if (!env.META_APP_SECRET) return fail("Falta META_APP_SECRET en el servidor", 500);
  const sig = (req.headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
  if (!sameSecret(sig, await hmacHex(env.META_APP_SECRET, raw))) return fail("Firma inválida", 401);
  let body;
  try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { return fail("JSON inválido"); }
  // Solo sirve para mostrar "último aviso de Meta": no se escribe en cada aviso (cuida el límite gratis de KV).
  const ultimo = await store.get("webhook:last");
  if (!ultimo || ultimo.object !== body.object || !(ahora - new Date(ultimo.at) < AVISO_MS)) await store.put("webhook:last", { at: ahora.toISOString(), object: body.object });

  const cfg = await leerConfig(store);
  const contestados = new Set(); // como mucho una respuesta automática por contacto en cada aviso de Meta
  // Cada mensaje entrante NUEVO: se guarda, se vuelve prospecto si es el primer contacto y, si toca, se contesta.
  // propio: lo mandó nuestro mismo número (no es prospecto ni se le contesta).
  const recibido = async (canal, peer, nombre, msg, { contestable, propio = false }) => {
    const r = await addMessage(store, canal, peer, nombre, msg);
    if (!r || propio) return; // reintento de Meta (ya se procesó) o mensaje de nuestro propio número
    if (!r.prev) await addLead(store, canal, peer, nombre, msg);
    const clave = `${canal}:${peer}`;
    if (!contestable || contestados.has(clave)) return;
    try {
      const e = { canal, id: peer, nombre, texto: msg.text, at: msg.at, primero: !r.prev, prev: r.prev };
      if (await (cfg.ventas.activo ? responderVentas(env, store, cfg, e, ahora, baseDe(req)) : responderSolo(env, store, cfg, e, ahora))) contestados.add(clave);
    } catch (e) {
      console.error("Agente de Sofía:", e); // nunca romper el webhook: Meta reintentaría y se duplicaría el trabajo
    }
  };

  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry ?? []) for (const ch of entry.changes ?? []) {
      const v = ch.value ?? {};
      const names = Object.fromEntries((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? ""]));
      const propio = String(v.metadata?.display_phone_number ?? "").replace(/\D/g, "");
      for (const m of v.messages ?? []) {
        const media = ["image", "video", "document", "audio", "sticker"].includes(m.type) ? { id: m[m.type]?.id, mime: m[m.type]?.mime_type, filename: m[m.type]?.filename ?? "" } : undefined;
        await recibido("wa", m.from, names[m.from], { id: m.id, dir: "in", type: m.type, text: waText(m), at: fechaMeta(Number(m.timestamp) * 1000, ahora), ...(media ? { media } : {}) },
          { contestable: !SIN_RESPUESTA.has(m.type) && !m.errors, propio: Boolean(propio) && m.from === propio });
      }
      for (const st of v.statuses ?? []) await setStatus(store, "wa", st.recipient_id, st.id, st.status);
    }
  } else if (body.object === "page") {
    for (const entry of body.entry ?? []) for (const ev of entry.messaging ?? []) {
      // El botón "Empezar" y los botones de la página llegan como postback: también son mensajes del cliente.
      const message = ev.message ?? (ev.postback ? { mid: ev.postback.mid ?? `pb.${ev.sender?.id}.${ev.timestamp}`, text: ev.postback.title ?? "" } : null);
      if (!message || message.is_echo) continue; // ecos de lo que manda la página: no son del cliente
      const psid = ev.sender?.id;
      if (!psid || psid === env.FB_PAGE_ID) continue;
      const att = message.attachments?.[0];
      await recibido("fb", psid, await nombreMessenger(env, store, psid), {
        id: message.mid, dir: "in", type: att ? att.type : "text", text: message.text ?? "", at: fechaMeta(ev.timestamp, ahora),
        ...(att?.payload?.url ? { media: { url: att.payload.url, mime: att.type === "image" ? "image/jpeg" : "" } } : {}),
      }, { contestable: true });
    }
  }
  return json({ ok: true });
}

// ───────── Envíos ─────────

/**
 * b: { channel, to, text | template, image? (URL pública HTTPS: va con el texto como pie de foto) }.
 * autoKey: lo manda el agente (se guarda con auto: true). indice: datos para guardar junto a la conversación.
 */
async function sendMessage(env, store, b, { ahora = new Date(), autoKey, indice } = {}) {
  const at = ahora.toISOString();
  const auto = autoKey ? { auto: true } : {};
  if (b.channel === "fb") {
    if (!fbReady(env)) throw new Error("Facebook no está configurado en el servidor");
    const enviar = (message) => graph(env, `${env.FB_PAGE_ID}/messages`, { method: "POST", token: env.FB_PAGE_TOKEN, body: { recipient: { id: b.to }, messaging_type: "RESPONSE", message } });
    if (b.image) { // Messenger no lleva pie de foto: primero la foto y luego el texto
      const ri = await enviar({ attachment: { type: "image", payload: { url: b.image, is_reusable: true } } });
      await addMessage(store, "fb", b.to, "", { id: ri.message_id, dir: "out", type: "image", text: "", at, status: "sent", media: { url: b.image }, ...auto }, autoKey);
    }
    const r = await enviar({ text: b.text });
    await addMessage(store, "fb", b.to, "", { id: r.message_id, dir: "out", type: "text", text: b.text, at, status: "sent", ...auto }, autoKey, indice);
    return { id: r.message_id };
  }
  if (!waReady(env)) throw new Error("WhatsApp no está configurado en el servidor");
  const to = String(b.to ?? "").replace(/\D/g, "");
  if (!to) throw new Error("Falta el número");
  let payload;
  let text = b.text ?? "";
  if (b.template) {
    const params = (b.template.params ?? []).map((t) => ({ type: "text", text: String(t) }));
    payload = { type: "template", template: { name: b.template.name, language: { code: b.template.lang || "es_MX" }, ...(params.length ? { components: [{ type: "body", parameters: params }] } : {}) } };
    text = b.template.preview || `[Plantilla ${b.template.name}]`;
  } else if (b.image && text.length <= MAX_PIE_WA) {
    payload = { type: "image", image: { link: b.image, ...(text ? { caption: text } : {}) } };
  } else {
    if (!text.trim()) throw new Error("Mensaje vacío");
    payload = { type: "text", text: { body: text, preview_url: true } };
  }
  const r = await graph(env, `${env.WA_PHONE_NUMBER_ID}/messages`, { method: "POST", token: env.WA_TOKEN, body: { messaging_product: "whatsapp", to, ...payload } });
  const id = r.messages?.[0]?.id;
  // Se guarda con el wa_id que confirma Meta: en México la app manda a 52 + 10 dígitos, pero el cliente
  // contesta (y llegan los estados) desde 521 + 10 dígitos. Así es una sola conversación y el agente
  // sabe que el asesor ya escribió (no hay bienvenida ni prospecto, y respeta pausaMinutos).
  const peer = String(r.contacts?.[0]?.wa_id ?? "").replace(/\D/g, "") || to;
  await addMessage(store, "wa", peer, "", { id, dir: "out", type: payload.type, text, at, status: "sent", ...(payload.image ? { media: { url: b.image } } : {}), ...auto }, autoKey, indice);
  return { id };
}
const MAX_PIE_WA = 1024; // WhatsApp: largo máximo del pie de foto

function deBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl ?? "");
  return m ? new Blob([deBase64(m[2])], { type: m[1] }) : null;
}

async function publishPost(env, store, b) {
  if (!fbReady(env)) throw new Error("Facebook no está configurado en el servidor");
  if (!b.message?.trim() && !b.image) throw new Error("La publicación está vacía");
  let r;
  const img = b.image ? dataUrlToBlob(b.image) : null;
  if (img) {
    const form = new FormData();
    form.append("caption", b.message ?? "");
    form.append("source", img, "foto.jpg");
    r = await graph(env, `${env.FB_PAGE_ID}/photos`, { method: "POST", token: env.FB_PAGE_TOKEN, form });
  } else {
    r = await graph(env, `${env.FB_PAGE_ID}/feed`, { method: "POST", token: env.FB_PAGE_TOKEN, body: { message: b.message, ...(b.link ? { link: b.link } : {}) } });
  }
  const postId = r.post_id ?? r.id;
  const posts = (await store.get("fb:posts")) ?? [];
  posts.unshift({ id: postId, at: new Date().toISOString(), message: (b.message ?? "").slice(0, 300), photo: Boolean(img) });
  await store.put("fb:posts", posts.slice(0, 200));
  return { id: postId, url: `https://www.facebook.com/${postId}` };
}

/** Instagram (cuenta profesional ligada a la página): primero un contenedor con la foto y luego se publica. */
async function publishInstagram(env, { caption, imageUrl }) {
  if (!igReady(env)) throw new Error("Instagram no está configurado en el servidor (falta IG_USER_ID)");
  const contenedor = await graph(env, `${env.IG_USER_ID}/media`, { method: "POST", token: env.FB_PAGE_TOKEN, body: { image_url: imageUrl, caption } });
  const r = await graph(env, `${env.IG_USER_ID}/media_publish`, { method: "POST", token: env.FB_PAGE_TOKEN, body: { creation_id: contenedor.id } });
  let url;
  try { url = (await graph(env, `${r.id}?fields=permalink`, { token: env.FB_PAGE_TOKEN })).permalink; } catch { /* ya se publicó; el enlace es opcional */ }
  return { id: r.id, ...(url ? { url } : {}) };
}

// ───────── Programador de publicaciones (Facebook e Instagram) ─────────
// social:cola  → [ { id, texto, mediaId?, mime?, cuando, canales, base, creado, estado, intentos, siguiente?, bloqueo?,
//                    resultados: { facebook?: { ok, id?, url?, error?, at }, instagram?: … } } ]
//                estado: "pendiente" → "publicando" → "publicado" | "error" (tras MAX_INTENTOS)
// media:<id>   → { mime, datos (base64) }  se sirve en público en /media/<id>: Instagram exige descargarla de una URL.
// social:hecho:<id>:<canal> → resultado ya publicado. En Cloudflare KV una copia vieja de la cola puede revivir
//                "pendiente" algo que ya salió; esta marca (clave propia, sin caché previa) evita publicarlo dos veces.

const CANALES = ["facebook", "instagram"];
const FOTOS = ["image/jpeg", "image/png", "image/gif"]; // nada de SVG: /media es público y comparte origen con la app
const MAX_INTENTOS = 3;
const MAX_COLA = 100;
const MAX_FOTO = 8 * 1024 * 1024; // límite de Instagram
const MAX_CAPTION_IG = 2200;
const REINTENTO_MS = 5 * 60 * 1000; // espera entre intentos: 5 min, luego 10 min
const BLOQUEO_MS = 15 * 60 * 1000; // si algo quedó "publicando" más tiempo, el proceso se cayó: se retoma

const nuevoId = () => crypto.randomUUID().replace(/-/g, "");
const hecho = (id, canal) => `social:hecho:${id}:${canal}`;
const MEDIA_ID = /^[a-f0-9]{32}$/;
// Archivos de WhatsApp que se entregan con su tipo; cualquier otro va como binario.
const MEDIA_SEGURA = /^(image\/(jpeg|png|gif|webp)|application\/pdf|audio\/(ogg|mpeg|mp4|aac|amr)|video\/(mp4|3gpp))$/;

/** Dirección pública del conector: PUBLIC_URL manda; si no, la de la petición (respetando el proxy HTTPS). */
function baseDe(req) {
  const u = new URL(req.url);
  const proto = (req.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  return `${proto ? `${proto}:` : u.protocol}//${u.host}`;
}
const publicBase = (env, base) => String(env.PUBLIC_URL || base || "").replace(/\/+$/, "");

async function programar(env, store, p, base, ahora) {
  if (!p || typeof p !== "object") throw invalido("Falta la publicación");
  const canales = [...new Set(Array.isArray(p.canales) ? p.canales : [])];
  if (!canales.length || canales.some((c) => !CANALES.includes(c))) throw invalido("Elige Facebook, Instagram o ambos");
  const texto = String(p.texto ?? "").trim();
  const cuando = new Date(p.cuando ?? ahora);
  if (Number.isNaN(cuando.getTime())) throw invalido("Fecha y hora inválidas");
  let foto = null;
  if (p.imagen) {
    const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(p.imagen));
    if (!m || !FOTOS.includes(m[1])) throw invalido("La foto debe ser JPG, PNG o GIF");
    foto = { mime: m[1], datos: m[2].replace(/\s+/g, "") };
    if (foto.datos.length * 0.75 > MAX_FOTO) throw invalido("La foto pesa más de 8 MB");
  }
  if (!texto && !foto) throw invalido("La publicación está vacía");
  if (canales.includes("facebook") && !fbReady(env)) throw invalido("Facebook no está configurado en el servidor");
  if (canales.includes("instagram")) {
    if (!igReady(env)) throw invalido("Instagram no está configurado en el servidor (falta IG_USER_ID)");
    if (!foto) throw invalido("Instagram solo publica con foto");
    if (foto.mime !== "image/jpeg") throw invalido("Instagram solo acepta fotos JPG");
    if (texto.length > MAX_CAPTION_IG) throw invalido(`Instagram acepta máximo ${MAX_CAPTION_IG} caracteres`);
    // Meta descarga la foto desde internet: con http://192.168… (servidor en casa sin túnel) fallaría 3 veces en silencio.
    if (!publicBase(env, base).startsWith("https://")) throw invalido("Instagram descarga la foto de una dirección pública HTTPS: define PUBLIC_URL en el servidor (o usa el túnel/Cloudflare)");
  }
  const cola = (await store.get("social:cola")) ?? [];
  const terminadas = cola.filter((x) => x.estado === "publicado" || x.estado === "error");
  if (cola.length - terminadas.length >= MAX_COLA) throw invalido(`Ya hay ${MAX_COLA} publicaciones en espera`);
  const item = { id: nuevoId(), texto, cuando: cuando.toISOString(), canales, base, creado: ahora.toISOString(), estado: "pendiente", intentos: 0, resultados: {} };
  if (foto) {
    item.mediaId = nuevoId();
    item.mime = foto.mime;
    await store.put(`media:${item.mediaId}`, foto);
  }
  cola.push(item);
  // Historial acotado: se olvidan primero las terminadas más viejas (y su foto).
  const sobran = terminadas.sort((a, b) => a.cuando.localeCompare(b.cuando)).slice(0, Math.max(0, cola.length - MAX_COLA));
  for (const x of sobran) {
    if (x.mediaId) await borrar(store, `media:${x.mediaId}`);
    for (const c of x.canales) if (x.resultados?.[c]?.ok) await borrar(store, hecho(x.id, c));
  }
  await store.put("social:cola", cola.filter((x) => !sobran.includes(x)));
  return item;
}

/** Lo que ve la app: sin la foto (pesa), con su dirección pública. */
function vistaCola(env, x, base) {
  const v = { ...x, imagen: x.mediaId ? `${publicBase(env, base || x.base)}/media/${x.mediaId}` : null };
  delete v.base;
  delete v.bloqueo;
  return v;
}

async function publicarProgramada(env, store, x, base, ahora) {
  const foto = x.mediaId ? await store.get(`media:${x.mediaId}`) : null;
  for (const canal of x.canales) {
    if (x.resultados[canal]?.ok) continue; // ya salió en ese canal: no duplicar al reintentar el otro
    const previo = await store.get(hecho(x.id, canal));
    if (previo?.ok) { x.resultados[canal] = previo; continue; } // ya salió, aunque la cola diga otra cosa
    let r;
    try {
      if (x.mediaId && !foto) throw new Error("La foto ya no está en el servidor"); // nunca publicar solo el texto
      if (canal === "facebook") {
        r = await publishPost(env, store, { message: x.texto, ...(foto ? { image: `data:${foto.mime};base64,${foto.datos}` } : {}) });
      } else {
        if (!foto) throw new Error("Instagram solo publica con foto");
        if (!base) throw new Error("Falta PUBLIC_URL: Instagram necesita una dirección pública para descargar la foto");
        r = await publishInstagram(env, { caption: x.texto, imageUrl: `${base}/media/${x.mediaId}` });
      }
    } catch (e) {
      x.resultados[canal] = { ok: false, error: e.message ?? String(e), at: ahora.toISOString() };
      continue;
    }
    x.resultados[canal] = { ok: true, id: r.id, ...(r.url ? { url: r.url } : {}), at: ahora.toISOString() };
    await store.put(hecho(x.id, canal), x.resultados[canal]);
  }
  delete x.bloqueo;
  if (x.canales.every((c) => x.resultados[c]?.ok)) {
    x.estado = "publicado";
    delete x.siguiente;
  } else if (x.intentos >= MAX_INTENTOS) {
    x.estado = "error"; // no se reintenta en bucle: la app muestra el error de cada canal
  } else {
    x.estado = "pendiente";
    x.siguiente = new Date(ahora.getTime() + x.intentos * REINTENTO_MS).toISOString();
  }
}

/**
 * Publica lo programado que ya venció. La llaman el cron de Cloudflare (cada 5 min) y servidor.mjs (cada minuto),
 * así funciona aunque la app esté cerrada. Si no hay nada que publicar no escribe nada (cuida el límite gratis de KV).
 * baseUrl: dirección pública del conector si no hay PUBLIC_URL (si falta, la que se guardó al programar).
 * soloId: publicar solo esa ("Publicar ahora"); lo demás vencido queda para el programador.
 */
export async function runScheduled(envBase, store, ahoraISO = new Date().toISOString(), baseUrl = "", soloId = null) {
  const env = await conConexion(envBase, store);
  const ahora = new Date(ahoraISO);
  const cola = (await store.get("social:cola")) ?? [];
  const vencidas = cola.filter((x) => (!soloId || x.id === soloId) && ((x.estado === "pendiente" && new Date(x.siguiente ?? x.cuando) <= ahora)
    || (x.estado === "publicando" && ahora - new Date(x.bloqueo) > BLOQUEO_MS)));
  if (!vencidas.length) return { revisadas: cola.length, publicadas: 0, fallidas: 0 };

  // Se apartan antes de llamar a Meta para que otra corrida simultánea no las publique dos veces.
  const intentar = [];
  for (const x of vencidas) {
    if ((x.intentos ?? 0) >= MAX_INTENTOS) { x.estado = "error"; delete x.bloqueo; continue; } // se cayó a media publicación demasiadas veces
    Object.assign(x, { estado: "publicando", bloqueo: ahora.toISOString(), intentos: (x.intentos ?? 0) + 1 });
    intentar.push(x);
  }
  await store.put("social:cola", cola);

  for (const x of intentar) await publicarProgramada(env, store, x, publicBase(env, baseUrl || x.base), ahora);

  // La cola pudo cambiar mientras se publicaba (la app programó otra): se mezcla por id.
  const porId = new Map(vencidas.map((x) => [x.id, x]));
  const actual = (await store.get("social:cola")) ?? [];
  await store.put("social:cola", actual.map((x) => porId.get(x.id) ?? x));
  return { revisadas: cola.length, publicadas: vencidas.filter((x) => x.estado === "publicado").length, fallidas: vencidas.filter((x) => x.estado !== "publicado").length };
}

async function status(env, store, ahora) {
  const out = { ok: true, version: VERSION, whatsapp: { configured: waReady(env) }, facebook: { configured: fbReady(env) }, instagram: { configured: igReady(env) }, webhook: { secret: Boolean(env.META_APP_SECRET), verifyToken: Boolean(env.META_VERIFY_TOKEN), last: await store.get("webhook:last") }, publicUrl: env.PUBLIC_URL || null };
  const cfg = await leerConfig(store);
  const errores = (await store.get("agente:errores")) ?? [];
  const inventario = (await store.get("ventas:inventario")) ?? [];
  out.agente = { activo: cfg.activo, enHorario: enHorario(cfg, ahora), reglas: cfg.reglas.length, ultimoError: errores[0] ?? null, ventas: { activo: cfg.ventas.activo, autos: inventario.filter((a) => a.disponible !== false).length, ia: { activa: Boolean(cfg.ventas.ia), motor: motorIA(env), llave: Boolean(motorIA(env)), modelo: motorIA(env) === "claude" ? env.ANTHROPIC_MODEL || MODELO_IA : motorIA(env) === "cloudflare" ? env.CF_AI_MODEL || MODELO_GRATIS : null } } };
  const nuevos = Object.values((await store.get("leads:index")) ?? {}).filter((l) => !l.importado);
  out.prospectos = { nuevos: nuevos.length, calientes: nuevos.filter((l) => l.cita || l.quiereAsesor).length };
  const cola = (await store.get("social:cola")) ?? [];
  out.programadas = { pendientes: cola.filter((x) => x.estado === "pendiente" || x.estado === "publicando").length, conError: cola.filter((x) => x.estado === "error").length };
  if (waReady(env)) {
    try {
      const p = await graph(env, `${env.WA_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating`, { token: env.WA_TOKEN });
      Object.assign(out.whatsapp, { ok: true, phone: p.display_phone_number, name: p.verified_name, quality: p.quality_rating });
    } catch (e) { Object.assign(out.whatsapp, { ok: false, error: e.message }); }
  }
  if (fbReady(env)) {
    try {
      const p = await graph(env, `${env.FB_PAGE_ID}?fields=name,link`, { token: env.FB_PAGE_TOKEN });
      Object.assign(out.facebook, { ok: true, name: p.name, link: p.link });
    } catch (e) { Object.assign(out.facebook, { ok: false, error: e.message }); }
  }
  if (igReady(env)) {
    try {
      const p = await graph(env, `${env.IG_USER_ID}?fields=username`, { token: env.FB_PAGE_TOKEN });
      Object.assign(out.instagram, { ok: true, username: p.username });
    } catch (e) { Object.assign(out.instagram, { ok: false, error: e.message }); }
  }
  return out;
}

// ───────── Router ─────────

/**
 * store: { get(key) → objeto|null, put(key, objeto), delete?(key) }
 * opciones: { ahora } fecha fija (ISO, Date o función) para probar horarios; si falta, la hora real.
 * Rutas de la app: token en ?token= (GET) o en el cuerpo JSON (POST, enviado como text/plain para evitar CORS preflight).
 */
export async function handle(req, envBase, store, opciones = {}) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  // Los datos de Meta guardados desde la app solo hacen falta para el webhook y la API (no para fotos públicas ni archivos).
  const env = path === "/webhook/meta" || (path.startsWith("/api/") && path !== "/api/salud") ? await conConexion(envBase, store) : envBase;
  const ahora = ahoraDe(opciones);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // Webhook de Meta (WhatsApp y Messenger)
  if (path === "/webhook/meta") {
    if (req.method === "GET") {
      const ok = url.searchParams.get("hub.mode") === "subscribe" && env.META_VERIFY_TOKEN && sameSecret(url.searchParams.get("hub.verify_token"), env.META_VERIFY_TOKEN);
      return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : new Response("Token de verificación incorrecto", { status: 403 });
    }
    if (req.method === "POST") return handleWebhook(req, env, store, ahora);
    return fail("Método no permitido", 405);
  }
  // Fotos de publicaciones programadas: PÚBLICAS (sin clave) porque Instagram las descarga de una URL.
  // El id es aleatorio de 128 bits, así que no se pueden adivinar.
  if (path.startsWith("/media/")) {
    if (req.method !== "GET" && req.method !== "HEAD") return fail("Método no permitido", 405);
    const id = path.slice("/media/".length);
    const foto = MEDIA_ID.test(id) ? await store.get(`media:${id}`) : null;
    if (!foto?.datos || !FOTOS.includes(foto.mime)) return new Response("No encontrado", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", ...CORS } });
    return new Response(deBase64(foto.datos), { headers: { "content-type": foto.mime, "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff", ...CORS } });
  }
  if (path === "/api/salud") return json({ ok: true, version: VERSION });
  if (!path.startsWith("/api/")) return null; // lo demás: archivos estáticos (lo decide el envoltorio)

  let body = {};
  if (req.method === "POST") {
    try { body = JSON.parse(await req.text()); } catch { return fail("JSON inválido"); }
  }
  const token = req.method === "GET" ? url.searchParams.get("token") : body.token;
  if (!env.SOFIA_TOKEN) return fail("El servidor no tiene SOFIA_TOKEN configurado", 500);
  if (!sameSecret(token, env.SOFIA_TOKEN)) return fail("Clave incorrecta", 401);

  try {
    switch (`${req.method} ${path}`) {
      case "GET /api/estado": return json(await status(env, store, ahora));
      case "GET /api/datos": {
        const doc = await store.get("datos:main");
        if (!doc) return json({ ok: true, updatedAt: null, backup: null });
        return json(url.searchParams.get("meta") ? { ok: true, updatedAt: doc.updatedAt } : { ok: true, ...doc });
      }
      case "POST /api/datos": {
        if (body.backup?.app !== "sofia-prueba") return fail("No es un respaldo de Sofía");
        const prev = await store.get("datos:main");
        if (prev) await store.put("datos:prev", prev);
        const updatedAt = new Date().toISOString();
        await store.put("datos:main", { updatedAt, backup: body.backup });
        return json({ ok: true, updatedAt });
      }
      case "GET /api/buzon": return json({ ok: true, conversations: (await store.get("inbox:index")) ?? {} });
      case "GET /api/buzon/conversacion": {
        const key = url.searchParams.get("c") ?? "";
        if (!/^(wa|fb):[\w.-]+$/.test(key)) return fail("Conversación inválida");
        return json({ ok: true, messages: (await store.get(`inbox:c:${key}`)) ?? [] });
      }
      case "POST /api/enviar": return json({ ok: true, ...(await sendMessage(env, store, body, { ahora })) });
      case "GET /api/wa/plantillas": {
        if (!env.WA_WABA_ID || !env.WA_TOKEN) return fail("Falta WA_WABA_ID para leer plantillas");
        const r = await graph(env, `${env.WA_WABA_ID}/message_templates?fields=name,language,status,category,components&limit=100`, { token: env.WA_TOKEN });
        return json({ ok: true, templates: (r.data ?? []).filter((t) => t.status === "APPROVED") });
      }
      case "GET /api/media": {
        const id = url.searchParams.get("id") ?? "";
        if (!/^\d+$/.test(id) || !waReady(env)) return fail("Archivo inválido");
        const meta = await graph(env, id, { token: env.WA_TOKEN });
        const file = await fetch(meta.url, { headers: { authorization: `Bearer ${env.WA_TOKEN}` } });
        if (!file.ok) return fail("No se pudo descargar el archivo de WhatsApp", 502);
        // Lo manda cualquiera que escriba al número: un HTML o SVG nunca debe abrirse como página.
        const tipo = String(meta.mime_type ?? "").split(";")[0].trim().toLowerCase();
        return new Response(file.body, { headers: { "content-type": MEDIA_SEGURA.test(tipo) ? tipo : "application/octet-stream", "content-disposition": "attachment", "x-content-type-options": "nosniff", "cache-control": "no-store", ...CORS } });
      }
      case "POST /api/facebook/publicar": return json({ ok: true, ...(await publishPost(env, store, body)) });
      case "GET /api/facebook/publicaciones": return json({ ok: true, posts: (await store.get("fb:posts")) ?? [] });

      // Agente sin IA
      case "GET /api/agente/config": return json({ ok: true, config: await leerConfig(store) });
      case "POST /api/agente/config": {
        if (!body.config || typeof body.config !== "object") return fail("Falta la configuración");
        const prev = await leerConfig(store);
        const config = normalizarConfig({ ...prev, ...body.config, horario: { ...prev.horario, ...(body.config.horario ?? {}) }, ventas: { ...prev.ventas, ...(body.config.ventas ?? {}) } });
        await store.put("agente:config", config);
        return json({ ok: true, config });
      }

      // Datos de Meta y de la IA desde la app (Más → Conexiones)
      case "GET /api/conexion": return json({ ok: true, ...(await vistaConexion(envBase, store, baseDe(req))) });
      case "POST /api/conexion": {
        await guardarConexion(envBase, store, body.datos);
        return json({ ok: true, ...(await vistaConexion(envBase, store, baseDe(req))) });
      }

      // Inventario de la vendedora (lo administra la app)
      case "GET /api/inventario": {
        const base = publicBase(env, baseDe(req));
        return json({ ok: true, autos: ((await store.get("ventas:inventario")) ?? []).map((a) => vistaAuto(a, base)) });
      }
      case "POST /api/inventario": {
        const base = publicBase(env, baseDe(req));
        return json({ ok: true, autos: (await guardarInventario(store, body.autos)).map((a) => vistaAuto(a, base)) });
      }
      case "POST /api/inventario/foto": {
        // Se sirve en público (/media/<id>) para que WhatsApp la descargue; el id es aleatorio de 128 bits.
        const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(body.imagen ?? ""));
        if (!m || !["image/jpeg", "image/png"].includes(m[1])) return fail("La foto debe ser JPG o PNG");
        const datos = m[2].replace(/\s+/g, "");
        if (datos.length * 0.75 > MAX_FOTO_AUTO) return fail("La foto pesa más de 5 MB (WhatsApp no la acepta)");
        const fotoId = nuevoId();
        await store.put(`media:${fotoId}`, { mime: m[1], datos });
        return json({ ok: true, fotoId, foto: `${publicBase(env, baseDe(req))}/media/${fotoId}` });
      }

      // Citas que agendó Sofía (la app las muestra en Hoy)
      case "GET /api/agenda": return json({ ok: true, citas: (await citasActivas(store, ahora)).sort((a, b) => a.id.localeCompare(b.id)) });
      case "POST /api/agenda/cancelar": {
        const citas = (await store.get("agenda:citas")) ?? [];
        const x = citas.find((c) => c.id === body.id && c.cliente === body.cliente && c.estado === "apartada");
        if (!x) return fail("Esa cita ya no está", 404);
        x.estado = "cancelada";
        await store.put("agenda:citas", citas);
        return json({ ok: true });
      }

      // "Probar a Sofía" desde la app: el mismo camino que un mensaje real (menú + IA del servidor), sin guardar ni enviar nada.
      case "POST /api/vendedora/probar": {
        const cfg = await leerConfig(store);
        const inventario = await inventarioVendedora(store, publicBase(env, baseDe(req)), false);
        const historial = (Array.isArray(body.historial) ? body.historial : []).slice(-30).map((m) => ({ dir: m?.dir === "out" ? "out" : "in", text: String(m?.text ?? "").slice(0, 1500) }));
        const conv = body.conv && typeof body.conv === "object" && !Array.isArray(body.conv) ? body.conv : {};
        const r = await pensarVenta(env, cfg, inventario, conv, { texto: String(body.texto ?? "").slice(0, 1500), nombre: String(body.nombre ?? "").slice(0, 60), primero: Boolean(body.primero) }, async () => historial, ahora, await libresDe(store, cfg, ahora));
        return json({ ok: true, ...r });
      }

      // Prospectos (contactos nuevos que escribieron por WhatsApp o Messenger)
      case "GET /api/prospectos": {
        const leads = (await store.get("leads:index")) ?? {};
        const prospectos = Object.entries(leads).map(([clave, l]) => ({ clave, ...l })).sort((a, b) => b.at.localeCompare(a.at));
        return json({ ok: true, prospectos });
      }
      case "POST /api/prospectos/marcar": {
        if (!Array.isArray(body.ids)) return fail("Faltan los prospectos a marcar (ids)");
        const leads = (await store.get("leads:index")) ?? {};
        const importado = body.importado !== false;
        let marcados = 0;
        for (const clave of body.ids) {
          const l = typeof clave === "string" && Object.hasOwn(leads, clave) ? leads[clave] : null; // "__proto__" no es un prospecto
          if (!l || l.importado === importado) continue;
          l.importado = importado;
          if (importado) l.importadoAt = ahora.toISOString(); else delete l.importadoAt;
          marcados++;
        }
        if (marcados) await store.put("leads:index", leads);
        return json({ ok: true, marcados });
      }

      // Programador de publicaciones
      case "POST /api/social/programar": {
        const base = baseDe(req);
        const item = await programar(env, store, body.post, base, ahora);
        // Si ya es hora ("publicar ahora"), sale de una vez SOLO esta; si falla, el programador la reintenta.
        if (new Date(item.cuando) <= ahora) await runScheduled(env, store, ahora.toISOString(), base, item.id);
        const final = ((await store.get("social:cola")) ?? []).find((x) => x.id === item.id) ?? item;
        return json({ ok: true, item: vistaCola(env, final, base) });
      }
      case "GET /api/social/cola": {
        const base = baseDe(req);
        const cola = ((await store.get("social:cola")) ?? []).map((x) => vistaCola(env, x, base)).sort((a, b) => a.cuando.localeCompare(b.cuando));
        return json({ ok: true, cola });
      }
      case "POST /api/social/cancelar": {
        const cola = (await store.get("social:cola")) ?? [];
        const item = cola.find((x) => x.id === body.id);
        if (!item) return fail("Esa publicación ya no está en la cola", 404);
        if (item.estado === "publicando") return fail("Se está publicando en este momento; intenta en un minuto", 409);
        await store.put("social:cola", cola.filter((x) => x !== item));
        if (item.mediaId) await borrar(store, `media:${item.mediaId}`);
        return json({ ok: true });
      }
      default: return fail("Ruta no encontrada", 404);
    }
  } catch (e) {
    return fail(e.message ?? String(e), e.status ?? 502);
  }
}
