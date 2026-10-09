// Conector de Sofía: núcleo independiente del hosting (solo Request/Response y Web Crypto estándar).
// Lo usan servidor.mjs (Node: tu PC, Render, Railway, VPS…) y cloudflare/worker.mjs (Cloudflare gratis).
//
// Hace de puente entre la app (que vive en el teléfono) y servicios que exigen un servidor:
//  - Datos:      respaldo/sincronización de la app.
//  - WhatsApp:   webhook oficial de Meta (mensajes entrantes con firma verificada), envío de texto y
//                plantillas por la API de WhatsApp Business (Cloud API), fotos/documentos recibidos.
//  - Messenger:  mensajes de la página de Facebook (mismo buzón).
//  - Facebook:   publicar en la página (texto o foto).
// Los tokens de Meta viven SOLO aquí (variables de entorno/secretos), nunca en el teléfono.
//
// Variables: SOFIA_TOKEN (clave de la app) · META_APP_SECRET · META_VERIFY_TOKEN · WA_TOKEN ·
// WA_PHONE_NUMBER_ID · WA_WABA_ID · FB_PAGE_ID · FB_PAGE_TOKEN · META_GRAPH_URL (opcional).

export const VERSION = "conector-1.0";
const MAX_MSGS = 500;

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
const fail = (error, status = 400) => json({ ok: false, error }, status);

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
// inbox:index           → { "<canal>:<id>": { channel, id, name, lastAt, lastText, lastDir, lastInAt, count } }
// inbox:c:<canal>:<id>  → [ { id, dir: "in"|"out", type, text, at, media?, status? } ]

async function addMessage(store, channel, peer, name, msg) {
  const key = `${channel}:${peer}`;
  const list = (await store.get(`inbox:c:${key}`)) ?? [];
  if (msg.id && list.some((m) => m.id === msg.id)) return; // Meta reintenta: no duplicar
  list.push(msg);
  if (list.length > MAX_MSGS) list.splice(0, list.length - MAX_MSGS);
  await store.put(`inbox:c:${key}`, list);
  const index = (await store.get("inbox:index")) ?? {};
  const prev = index[key] ?? { channel, id: peer, count: 0 };
  index[key] = {
    ...prev,
    name: name || prev.name || "",
    lastAt: msg.at,
    lastText: msg.text || (msg.media ? `[${msg.type}]` : ""),
    lastDir: msg.dir,
    lastInAt: msg.dir === "in" ? msg.at : prev.lastInAt ?? null,
    count: prev.count + 1,
  };
  await store.put("inbox:index", index);
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

async function handleWebhook(req, env, store) {
  const raw = new Uint8Array(await req.arrayBuffer());
  if (!env.META_APP_SECRET) return fail("Falta META_APP_SECRET en el servidor", 500);
  const sig = (req.headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
  if (!sameSecret(sig, await hmacHex(env.META_APP_SECRET, raw))) return fail("Firma inválida", 401);
  let body;
  try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { return fail("JSON inválido"); }
  await store.put("webhook:last", { at: new Date().toISOString(), object: body.object });

  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry ?? []) for (const ch of entry.changes ?? []) {
      const v = ch.value ?? {};
      const names = Object.fromEntries((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? ""]));
      for (const m of v.messages ?? []) {
        const media = ["image", "video", "document", "audio", "sticker"].includes(m.type) ? { id: m[m.type]?.id, mime: m[m.type]?.mime_type, filename: m[m.type]?.filename ?? "" } : undefined;
        await addMessage(store, "wa", m.from, names[m.from], { id: m.id, dir: "in", type: m.type, text: waText(m), at: new Date(Number(m.timestamp) * 1000).toISOString(), ...(media ? { media } : {}) });
      }
      for (const st of v.statuses ?? []) await setStatus(store, "wa", st.recipient_id, st.id, st.status);
    }
  } else if (body.object === "page") {
    for (const entry of body.entry ?? []) for (const ev of entry.messaging ?? []) {
      if (!ev.message || ev.message.is_echo) continue;
      const att = ev.message.attachments?.[0];
      await addMessage(store, "fb", ev.sender.id, "", {
        id: ev.message.mid, dir: "in", type: att ? att.type : "text", text: ev.message.text ?? "", at: new Date(ev.timestamp).toISOString(),
        ...(att?.payload?.url ? { media: { url: att.payload.url, mime: att.type === "image" ? "image/jpeg" : "" } } : {}),
      });
    }
  }
  return json({ ok: true });
}

// ───────── Envíos ─────────

async function sendMessage(env, store, b) {
  const at = new Date().toISOString();
  if (b.channel === "fb") {
    if (!fbReady(env)) throw new Error("Facebook no está configurado en el servidor");
    const r = await graph(env, `${env.FB_PAGE_ID}/messages`, { method: "POST", token: env.FB_PAGE_TOKEN, body: { recipient: { id: b.to }, messaging_type: "RESPONSE", message: { text: b.text } } });
    await addMessage(store, "fb", b.to, "", { id: r.message_id, dir: "out", type: "text", text: b.text, at, status: "sent" });
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
  await addMessage(store, "wa", to, "", { id, dir: "out", type: b.template ? "template" : "text", text, at, status: "sent" });
  return { id };
}

function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl ?? "");
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
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

async function status(env, store) {
  const out = { ok: true, version: VERSION, whatsapp: { configured: waReady(env) }, facebook: { configured: fbReady(env) }, webhook: { secret: Boolean(env.META_APP_SECRET), verifyToken: Boolean(env.META_VERIFY_TOKEN), last: await store.get("webhook:last") } };
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
  return out;
}

// ───────── Router ─────────

/**
 * store: { get(key) → objeto|null, put(key, objeto) }
 * Rutas de la app: token en ?token= (GET) o en el cuerpo JSON (POST, enviado como text/plain para evitar CORS preflight).
 */
export async function handle(req, env, store) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // Webhook de Meta (WhatsApp y Messenger)
  if (path === "/webhook/meta") {
    if (req.method === "GET") {
      const ok = url.searchParams.get("hub.mode") === "subscribe" && env.META_VERIFY_TOKEN && sameSecret(url.searchParams.get("hub.verify_token"), env.META_VERIFY_TOKEN);
      return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : new Response("Token de verificación incorrecto", { status: 403 });
    }
    if (req.method === "POST") return handleWebhook(req, env, store);
    return fail("Método no permitido", 405);
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
      case "GET /api/estado": return json(await status(env, store));
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
      case "POST /api/enviar": return json({ ok: true, ...(await sendMessage(env, store, body)) });
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
      default: return fail("Ruta no encontrada", 404);
    }
  } catch (e) {
    return fail(e.message ?? String(e), 502);
  }
}
