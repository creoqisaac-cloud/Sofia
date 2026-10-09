// Archivo único para pegar en el editor de Cloudflare (Workers → Edit code). GENERADO desde worker.mjs + core.mjs.

// prueba/servidor/core.mjs
var VERSION = "conector-1.0";
var MAX_MSGS = 500;
var CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };
var json = (body, status2 = 200) => new Response(JSON.stringify(body), { status: status2, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });
var fail = (error, status2 = 400) => json({ ok: false, error }, status2);
var enc = new TextEncoder();
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
var graphUrl = (env) => (env.META_GRAPH_URL || "https://graph.facebook.com/v23.0").replace(/\/+$/, "");
var waReady = (env) => Boolean(env.WA_TOKEN && env.WA_PHONE_NUMBER_ID);
var fbReady = (env) => Boolean(env.FB_PAGE_ID && env.FB_PAGE_TOKEN);
async function graph(env, path, { method = "GET", token, body, form } = {}) {
  const res = await fetch(`${graphUrl(env)}/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...body ? { "content-type": "application/json" } : {} },
    body: form ?? (body ? JSON.stringify(body) : void 0)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    throw new Error(e.error_user_msg || e.message || `Meta respondi\xF3 ${res.status}`);
  }
  return data;
}
async function addMessage(store, channel, peer, name, msg) {
  const key = `${channel}:${peer}`;
  const list = await store.get(`inbox:c:${key}`) ?? [];
  if (msg.id && list.some((m) => m.id === msg.id)) return;
  list.push(msg);
  if (list.length > MAX_MSGS) list.splice(0, list.length - MAX_MSGS);
  await store.put(`inbox:c:${key}`, list);
  const index = await store.get("inbox:index") ?? {};
  const prev = index[key] ?? { channel, id: peer, count: 0 };
  index[key] = {
    ...prev,
    name: name || prev.name || "",
    lastAt: msg.at,
    lastText: msg.text || (msg.media ? `[${msg.type}]` : ""),
    lastDir: msg.dir,
    lastInAt: msg.dir === "in" ? msg.at : prev.lastInAt ?? null,
    count: prev.count + 1
  };
  await store.put("inbox:index", index);
}
async function setStatus(store, channel, peer, id, status2) {
  const k = `inbox:c:${channel}:${peer}`;
  const list = await store.get(k);
  const m = list?.find((x) => x.id === id);
  if (!m) return;
  m.status = status2;
  await store.put(k, list);
}
function waText(m) {
  switch (m.type) {
    case "text":
      return m.text?.body ?? "";
    case "image":
    case "video":
    case "document":
    case "audio":
    case "sticker":
      return m[m.type]?.caption ?? "";
    case "button":
      return m.button?.text ?? "";
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
    case "location":
      return `\u{1F4CD} ${m.location?.latitude},${m.location?.longitude}`;
    case "reaction":
      return m.reaction?.emoji ?? "";
    default:
      return `[${m.type}]`;
  }
}
async function handleWebhook(req, env, store) {
  const raw = new Uint8Array(await req.arrayBuffer());
  if (!env.META_APP_SECRET) return fail("Falta META_APP_SECRET en el servidor", 500);
  const sig = (req.headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
  if (!sameSecret(sig, await hmacHex(env.META_APP_SECRET, raw))) return fail("Firma inv\xE1lida", 401);
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return fail("JSON inv\xE1lido");
  }
  await store.put("webhook:last", { at: (/* @__PURE__ */ new Date()).toISOString(), object: body.object });
  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry ?? []) for (const ch of entry.changes ?? []) {
      const v = ch.value ?? {};
      const names = Object.fromEntries((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? ""]));
      for (const m of v.messages ?? []) {
        const media = ["image", "video", "document", "audio", "sticker"].includes(m.type) ? { id: m[m.type]?.id, mime: m[m.type]?.mime_type, filename: m[m.type]?.filename ?? "" } : void 0;
        await addMessage(store, "wa", m.from, names[m.from], { id: m.id, dir: "in", type: m.type, text: waText(m), at: new Date(Number(m.timestamp) * 1e3).toISOString(), ...media ? { media } : {} });
      }
      for (const st of v.statuses ?? []) await setStatus(store, "wa", st.recipient_id, st.id, st.status);
    }
  } else if (body.object === "page") {
    for (const entry of body.entry ?? []) for (const ev of entry.messaging ?? []) {
      if (!ev.message || ev.message.is_echo) continue;
      const att = ev.message.attachments?.[0];
      await addMessage(store, "fb", ev.sender.id, "", {
        id: ev.message.mid,
        dir: "in",
        type: att ? att.type : "text",
        text: ev.message.text ?? "",
        at: new Date(ev.timestamp).toISOString(),
        ...att?.payload?.url ? { media: { url: att.payload.url, mime: att.type === "image" ? "image/jpeg" : "" } } : {}
      });
    }
  }
  return json({ ok: true });
}
async function sendMessage(env, store, b) {
  const at = (/* @__PURE__ */ new Date()).toISOString();
  if (b.channel === "fb") {
    if (!fbReady(env)) throw new Error("Facebook no est\xE1 configurado en el servidor");
    const r2 = await graph(env, `${env.FB_PAGE_ID}/messages`, { method: "POST", token: env.FB_PAGE_TOKEN, body: { recipient: { id: b.to }, messaging_type: "RESPONSE", message: { text: b.text } } });
    await addMessage(store, "fb", b.to, "", { id: r2.message_id, dir: "out", type: "text", text: b.text, at, status: "sent" });
    return { id: r2.message_id };
  }
  if (!waReady(env)) throw new Error("WhatsApp no est\xE1 configurado en el servidor");
  const to = String(b.to ?? "").replace(/\D/g, "");
  if (!to) throw new Error("Falta el n\xFAmero");
  let payload;
  let text = b.text ?? "";
  if (b.template) {
    const params = (b.template.params ?? []).map((t) => ({ type: "text", text: String(t) }));
    payload = { type: "template", template: { name: b.template.name, language: { code: b.template.lang || "es_MX" }, ...params.length ? { components: [{ type: "body", parameters: params }] } : {} } };
    text = b.template.preview || `[Plantilla ${b.template.name}]`;
  } else {
    if (!text.trim()) throw new Error("Mensaje vac\xEDo");
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
  if (!fbReady(env)) throw new Error("Facebook no est\xE1 configurado en el servidor");
  if (!b.message?.trim() && !b.image) throw new Error("La publicaci\xF3n est\xE1 vac\xEDa");
  let r;
  const img = b.image ? dataUrlToBlob(b.image) : null;
  if (img) {
    const form = new FormData();
    form.append("caption", b.message ?? "");
    form.append("source", img, "foto.jpg");
    r = await graph(env, `${env.FB_PAGE_ID}/photos`, { method: "POST", token: env.FB_PAGE_TOKEN, form });
  } else {
    r = await graph(env, `${env.FB_PAGE_ID}/feed`, { method: "POST", token: env.FB_PAGE_TOKEN, body: { message: b.message, ...b.link ? { link: b.link } : {} } });
  }
  const postId = r.post_id ?? r.id;
  const posts = await store.get("fb:posts") ?? [];
  posts.unshift({ id: postId, at: (/* @__PURE__ */ new Date()).toISOString(), message: (b.message ?? "").slice(0, 300), photo: Boolean(img) });
  await store.put("fb:posts", posts.slice(0, 200));
  return { id: postId, url: `https://www.facebook.com/${postId}` };
}
async function status(env, store) {
  const out = { ok: true, version: VERSION, whatsapp: { configured: waReady(env) }, facebook: { configured: fbReady(env) }, webhook: { secret: Boolean(env.META_APP_SECRET), verifyToken: Boolean(env.META_VERIFY_TOKEN), last: await store.get("webhook:last") } };
  if (waReady(env)) {
    try {
      const p = await graph(env, `${env.WA_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating`, { token: env.WA_TOKEN });
      Object.assign(out.whatsapp, { ok: true, phone: p.display_phone_number, name: p.verified_name, quality: p.quality_rating });
    } catch (e) {
      Object.assign(out.whatsapp, { ok: false, error: e.message });
    }
  }
  if (fbReady(env)) {
    try {
      const p = await graph(env, `${env.FB_PAGE_ID}?fields=name,link`, { token: env.FB_PAGE_TOKEN });
      Object.assign(out.facebook, { ok: true, name: p.name, link: p.link });
    } catch (e) {
      Object.assign(out.facebook, { ok: false, error: e.message });
    }
  }
  return out;
}
async function handle(req, env, store) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (path === "/webhook/meta") {
    if (req.method === "GET") {
      const ok = url.searchParams.get("hub.mode") === "subscribe" && env.META_VERIFY_TOKEN && sameSecret(url.searchParams.get("hub.verify_token"), env.META_VERIFY_TOKEN);
      return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : new Response("Token de verificaci\xF3n incorrecto", { status: 403 });
    }
    if (req.method === "POST") return handleWebhook(req, env, store);
    return fail("M\xE9todo no permitido", 405);
  }
  if (path === "/api/salud") return json({ ok: true, version: VERSION });
  if (!path.startsWith("/api/")) return null;
  let body = {};
  if (req.method === "POST") {
    try {
      body = JSON.parse(await req.text());
    } catch {
      return fail("JSON inv\xE1lido");
    }
  }
  const token = req.method === "GET" ? url.searchParams.get("token") : body.token;
  if (!env.SOFIA_TOKEN) return fail("El servidor no tiene SOFIA_TOKEN configurado", 500);
  if (!sameSecret(token, env.SOFIA_TOKEN)) return fail("Clave incorrecta", 401);
  try {
    switch (`${req.method} ${path}`) {
      case "GET /api/estado":
        return json(await status(env, store));
      case "GET /api/datos": {
        const doc = await store.get("datos:main");
        if (!doc) return json({ ok: true, updatedAt: null, backup: null });
        return json(url.searchParams.get("meta") ? { ok: true, updatedAt: doc.updatedAt } : { ok: true, ...doc });
      }
      case "POST /api/datos": {
        if (body.backup?.app !== "sofia-prueba") return fail("No es un respaldo de Sof\xEDa");
        const prev = await store.get("datos:main");
        if (prev) await store.put("datos:prev", prev);
        const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        await store.put("datos:main", { updatedAt, backup: body.backup });
        return json({ ok: true, updatedAt });
      }
      case "GET /api/buzon":
        return json({ ok: true, conversations: await store.get("inbox:index") ?? {} });
      case "GET /api/buzon/conversacion": {
        const key = url.searchParams.get("c") ?? "";
        if (!/^(wa|fb):[\w.-]+$/.test(key)) return fail("Conversaci\xF3n inv\xE1lida");
        return json({ ok: true, messages: await store.get(`inbox:c:${key}`) ?? [] });
      }
      case "POST /api/enviar":
        return json({ ok: true, ...await sendMessage(env, store, body) });
      case "GET /api/wa/plantillas": {
        if (!env.WA_WABA_ID || !env.WA_TOKEN) return fail("Falta WA_WABA_ID para leer plantillas");
        const r = await graph(env, `${env.WA_WABA_ID}/message_templates?fields=name,language,status,category,components&limit=100`, { token: env.WA_TOKEN });
        return json({ ok: true, templates: (r.data ?? []).filter((t) => t.status === "APPROVED") });
      }
      case "GET /api/media": {
        const id = url.searchParams.get("id") ?? "";
        if (!/^\d+$/.test(id) || !waReady(env)) return fail("Archivo inv\xE1lido");
        const meta = await graph(env, id, { token: env.WA_TOKEN });
        const file = await fetch(meta.url, { headers: { authorization: `Bearer ${env.WA_TOKEN}` } });
        if (!file.ok) return fail("No se pudo descargar el archivo de WhatsApp", 502);
        return new Response(file.body, { headers: { "content-type": meta.mime_type ?? "application/octet-stream", "cache-control": "no-store", ...CORS } });
      }
      case "POST /api/facebook/publicar":
        return json({ ok: true, ...await publishPost(env, store, body) });
      case "GET /api/facebook/publicaciones":
        return json({ ok: true, posts: await store.get("fb:posts") ?? [] });
      default:
        return fail("Ruta no encontrada", 404);
    }
  } catch (e) {
    return fail(e.message ?? String(e), 502);
  }
}

// prueba/servidor/cloudflare/worker.mjs
var kvStore = (kv) => ({
  async get(key) {
    return kv.get(key, "json");
  },
  async put(key, value) {
    await kv.put(key, JSON.stringify(value));
  }
});
var worker = {
  async fetch(request, env) {
    if (!env.SOFIA_KV) return new Response(JSON.stringify({ ok: false, error: "Falta vincular el KV 'SOFIA_KV' al Worker" }), { status: 500, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
    const res = await handle(request, env, kvStore(env.SOFIA_KV));
    return res ?? new Response(`Conector de Sof\xEDa (${VERSION}) funcionando.`, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
};
var worker_default = worker;
export {
  worker_default as default
};
