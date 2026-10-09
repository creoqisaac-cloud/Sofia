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
//  - Agente:       contesta en WhatsApp y Messenger con bienvenida, aviso de fuera de horario y reglas por palabra.
//  - Prospectos:   guarda a cada contacto nuevo para que la app lo convierta en cliente.
//  - Programador:  publica en Facebook/Instagram a la hora indicada (runScheduled, lo llama un temporizador).
// Los tokens de Meta viven SOLO aquí (variables de entorno/secretos), nunca en el teléfono.
//
// Variables: SOFIA_TOKEN (clave de la app) · META_APP_SECRET · META_VERIFY_TOKEN · WA_TOKEN ·
// WA_PHONE_NUMBER_ID · WA_WABA_ID · FB_PAGE_ID · FB_PAGE_TOKEN · IG_USER_ID (Instagram; usa FB_PAGE_TOKEN) ·
// PUBLIC_URL (dirección pública del conector, para que Instagram descargue las fotos) · META_GRAPH_URL (opcional).

export const VERSION = "conector-1.1";
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
 */
async function addMessage(store, channel, peer, name, msg, autoKey) {
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
  };
  await store.put("inbox:index", index);
  return { prev };
}

async function setStatus(store, channel, peer, id, status) {
  const k = `inbox:c:${channel}:${peer}`;
  const list = await store.get(k);
  const m = list?.find((x) => x.id === id);
  if (!m) return;
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

const AGENTE_BASE = {
  activo: false,
  zonaHoraria: "America/Monterrey",
  horario: { dias: [1, 2, 3, 4, 5, 6], inicio: "09:00", fin: "19:00" }, // 0 = domingo, 1 = lunes … 6 = sábado
  bienvenida: "¡Hola {nombre}! Gracias por escribir. En un momento te atiendo.",
  fueraDeHorario: "¡Hola {nombre}! Gracias por tu mensaje. En este momento estoy fuera de horario; te contesto en cuanto regrese.",
  reglas: [], // [ { palabras: ["precio", "cuánto cuesta"], respuesta: "…" } ]
  esperaHoras: 12, // no repetir la misma respuesta automática al mismo contacto antes de N horas
  pausaMinutos: 30, // si el asesor contestó a mano hace menos de N minutos, el agente no interrumpe
  asesor: "",
  agencia: "",
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
  };
}

async function leerConfig(store) {
  const c = await store.get("agente:config");
  return { ...AGENTE_BASE, ...(c ?? {}), horario: { ...AGENTE_BASE.horario, ...(c?.horario ?? {}) } };
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

const sinAcentos = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** La palabra (o frase) aparece completa en el texto: sin acentos, sin mayúsculas, con límite de palabra. */
function contienePalabra(texto, palabra) {
  const p = sinAcentos(palabra).trim();
  if (!p) return false;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escaparRegex(p).replace(/\s+/g, "\\s+")}(?=$|[^\\p{L}\\p{N}])`, "u");
  return re.test(sinAcentos(texto));
}

/**
 * "ANA maría 🌸" → "Ana". Los nombres de perfil vienen como cada quien los escribió y los controla el cliente:
 * si el primero no parece un nombre (una liga, "{agencia}", 200 letras…) se omite en vez de repetirlo.
 */
function primerNombre(nombre) {
  const t = String(nombre ?? "").normalize("NFC").split(/\s+/).map((x) => x.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")).find(Boolean) ?? "";
  if (t.length > 30 || !/^\p{L}[\p{L}\p{M}'’.-]*$/u.test(t)) return "";
  return t === t.toUpperCase() || t === t.toLowerCase() ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t;
}

/**
 * Sustituye {nombre}, {asesor} y {agencia} (también {Nombre}: el teclado del teléfono pone mayúscula sola);
 * si alguno viene vacío no deja espacios sueltos ("¡Hola !") ni una coma al inicio ("{nombre}, gracias…").
 */
function rellenar(plantilla, vars) {
  const t = plantilla.replace(/\{(nombre|asesor|agencia)\}/gi, (_, k) => vars[k.toLowerCase()] ?? "")
    .replace(/[ \t]+([,.!?;:])/g, "$1").replace(/([¡¿])[ \t]+/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
  const sinInicio = t.replace(/^[,.;:]+\s*/, "");
  return sinInicio === t ? t : sinInicio.charAt(0).toUpperCase() + sinInicio.slice(1);
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
  const text = rellenar(plantilla, { nombre: primerNombre(e.nombre), asesor: cfg.asesor, agencia: cfg.agencia });
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

async function handleWebhook(req, env, store, ahora) {
  const raw = new Uint8Array(await req.arrayBuffer());
  if (!env.META_APP_SECRET) return fail("Falta META_APP_SECRET en el servidor", 500);
  const sig = (req.headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
  if (!sameSecret(sig, await hmacHex(env.META_APP_SECRET, raw))) return fail("Firma inválida", 401);
  let body;
  try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { return fail("JSON inválido"); }
  await store.put("webhook:last", { at: ahora.toISOString(), object: body.object });

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
      if (await responderSolo(env, store, cfg, { canal, id: peer, nombre, texto: msg.text, at: msg.at, primero: !r.prev, prev: r.prev }, ahora)) contestados.add(clave);
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

/** b: { channel, to, text | template }. autoKey: lo manda el agente (se guarda con auto: true). */
async function sendMessage(env, store, b, { ahora = new Date(), autoKey } = {}) {
  const at = ahora.toISOString();
  const auto = autoKey ? { auto: true } : {};
  if (b.channel === "fb") {
    if (!fbReady(env)) throw new Error("Facebook no está configurado en el servidor");
    const r = await graph(env, `${env.FB_PAGE_ID}/messages`, { method: "POST", token: env.FB_PAGE_TOKEN, body: { recipient: { id: b.to }, messaging_type: "RESPONSE", message: { text: b.text } } });
    await addMessage(store, "fb", b.to, "", { id: r.message_id, dir: "out", type: "text", text: b.text, at, status: "sent", ...auto }, autoKey);
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
  await addMessage(store, "wa", peer, "", { id, dir: "out", type: b.template ? "template" : "text", text, at, status: "sent", ...auto }, autoKey);
  return { id };
}

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

const CANALES = ["facebook", "instagram"];
const FOTOS = ["image/jpeg", "image/png", "image/gif"]; // nada de SVG: /media es público y comparte origen con la app
const MAX_INTENTOS = 3;
const MAX_COLA = 100;
const MAX_FOTO = 8 * 1024 * 1024; // límite de Instagram
const MAX_CAPTION_IG = 2200;
const REINTENTO_MS = 5 * 60 * 1000; // espera entre intentos: 5 min, luego 10 min
const BLOQUEO_MS = 15 * 60 * 1000; // si algo quedó "publicando" más tiempo, el proceso se cayó: se retoma

const nuevoId = () => crypto.randomUUID().replace(/-/g, "");
const MEDIA_ID = /^[a-f0-9]{32}$/;

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
  for (const x of sobran) if (x.mediaId) await borrar(store, `media:${x.mediaId}`);
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
    try {
      let r;
      if (x.mediaId && !foto) throw new Error("La foto ya no está en el servidor"); // nunca publicar solo el texto
      if (canal === "facebook") {
        r = await publishPost(env, store, { message: x.texto, ...(foto ? { image: `data:${foto.mime};base64,${foto.datos}` } : {}) });
      } else {
        if (!foto) throw new Error("Instagram solo publica con foto");
        if (!base) throw new Error("Falta PUBLIC_URL: Instagram necesita una dirección pública para descargar la foto");
        r = await publishInstagram(env, { caption: x.texto, imageUrl: `${base}/media/${x.mediaId}` });
      }
      x.resultados[canal] = { ok: true, id: r.id, ...(r.url ? { url: r.url } : {}), at: ahora.toISOString() };
    } catch (e) {
      x.resultados[canal] = { ok: false, error: e.message ?? String(e), at: ahora.toISOString() };
    }
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
 */
export async function runScheduled(env, store, ahoraISO = new Date().toISOString(), baseUrl = "") {
  const ahora = new Date(ahoraISO);
  const cola = (await store.get("social:cola")) ?? [];
  const vencidas = cola.filter((x) => (x.estado === "pendiente" && new Date(x.siguiente ?? x.cuando) <= ahora)
    || (x.estado === "publicando" && ahora - new Date(x.bloqueo) > BLOQUEO_MS));
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
  out.agente = { activo: cfg.activo, enHorario: enHorario(cfg, ahora), reglas: cfg.reglas.length, ultimoError: errores[0] ?? null };
  out.prospectos = { nuevos: Object.values((await store.get("leads:index")) ?? {}).filter((l) => !l.importado).length };
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
export async function handle(req, env, store, opciones = {}) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
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
        return new Response(file.body, { headers: { "content-type": meta.mime_type ?? "application/octet-stream", "cache-control": "no-store", ...CORS } });
      }
      case "POST /api/facebook/publicar": return json({ ok: true, ...(await publishPost(env, store, body)) });
      case "GET /api/facebook/publicaciones": return json({ ok: true, posts: (await store.get("fb:posts")) ?? [] });

      // Agente sin IA
      case "GET /api/agente/config": return json({ ok: true, config: await leerConfig(store) });
      case "POST /api/agente/config": {
        if (!body.config || typeof body.config !== "object") return fail("Falta la configuración");
        const prev = await leerConfig(store);
        const config = normalizarConfig({ ...prev, ...body.config, horario: { ...prev.horario, ...(body.config.horario ?? {}) } });
        await store.put("agente:config", config);
        return json({ ok: true, config });
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
        // Si ya es hora ("publicar ahora"), sale de una vez; si falla, el programador lo reintenta.
        if (new Date(item.cuando) <= ahora) await runScheduled(env, store, ahora.toISOString(), base);
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
