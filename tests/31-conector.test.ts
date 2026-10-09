/**
 * Conector de Sofía (prueba/servidor/core.mjs) contra una API de Meta SIMULADA (sin red real):
 * webhook con firma, buzón, envío por WhatsApp Cloud API, plantillas, archivos, Messenger y Facebook;
 * agente sin IA (respuestas automáticas por reglas), prospectos y programador de publicaciones (Facebook + Instagram).
 * Todas las personas y números son inventados.
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error módulo JS sin tipos
import { handle, runScheduled } from "../prueba/servidor/core.mjs";
// @ts-expect-error módulo JS sin tipos
import worker from "../prueba/servidor/cloudflare/worker.mjs";

type Rec = { method: string; path: string; auth?: string; body: string; type?: string };
const calls: Rec[] = [];
let enviados = 0; // cada envío simulado recibe un id distinto, como en Meta
let fake: http.Server;
let G = "";

// Almacén en memoria SIN delete (como servidor.mjs); cuenta escrituras para vigilar el límite gratis de KV.
const memStore = () => {
  const m = new Map<string, string>();
  const s = {
    escrituras: 0,
    async get(k: string) { return m.has(k) ? JSON.parse(m.get(k)!) : null; },
    async put(k: string, v: unknown) { s.escrituras++; m.set(k, JSON.stringify(v)); },
  };
  return s;
};

beforeAll(async () => {
  fake = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const path = req.url ?? "";
      calls.push({ method: req.method!, path, auth: req.headers.authorization, body, type: req.headers["content-type"] });
      const send = (o: unknown, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (req.headers.authorization !== "Bearer tok-wa" && req.headers.authorization !== "Bearer tok-fb") return send({ error: { message: "Invalid OAuth access token" } }, 401);
      if (path.startsWith("/v/111?fields")) return send({ display_phone_number: "+52 81 0000 0000", verified_name: "Agencia Prueba" });
      if (path === "/v/111/messages") {
        // Como Meta con celulares de México: se manda a 52 + 10 dígitos y el wa_id del cliente es 521 + 10 dígitos.
        const to = String(JSON.parse(body).to);
        return send({ messaging_product: "whatsapp", contacts: [{ input: to, wa_id: to.replace(/^52(\d{10})$/, "521$1") }], messages: [{ id: `wamid.OUT${++enviados}` }] });
      }
      if (path.startsWith("/v/222/message_templates")) return send({ data: [{ name: "hello_world", status: "APPROVED", language: "en_US" }, { name: "borrador", status: "PENDING" }] });
      if (path === "/v/555") return send({ url: `${G}/archivo/555`, mime_type: "image/jpeg" });
      if (path === "/archivo/555") { res.writeHead(200, { "content-type": "image/jpeg" }); return res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9])); }
      if (path.startsWith("/v/333?fields")) return send({ name: "Página Prueba", link: "https://facebook.com/prueba" });
      if (path === "/v/333/photos") return send({ id: "ph1", post_id: "333_99" });
      if (path === "/v/333/feed") return send({ id: "333_100" });
      if (path === "/v/333/messages") return send({ message_id: `m_out${++enviados}` });
      if (path.startsWith("/v/444?fields")) return send({ username: "agencia.prueba" });
      if (path === "/v/444/media") return send({ id: "cont1" });
      if (path === "/v/444/media_publish") return send({ id: "igpost1" });
      if (path.startsWith("/v/igpost1?fields")) return send({ permalink: "https://www.instagram.com/p/prueba1/" });
      if (path.startsWith("/v/PSID9?fields")) return send({ first_name: "Luis", last_name: "Prueba" });
      send({ error: { message: `ruta simulada desconocida ${path}` } }, 404);
    });
  });
  await new Promise<void>((r) => fake.listen(0, "127.0.0.1", () => r()));
  G = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
});
afterAll(() => fake.close());

const env = () => ({ SOFIA_TOKEN: "clave", META_APP_SECRET: "secreto-app", META_VERIFY_TOKEN: "verifica", WA_TOKEN: "tok-wa", WA_PHONE_NUMBER_ID: "111", WA_WABA_ID: "222", FB_PAGE_ID: "333", FB_PAGE_TOKEN: "tok-fb", IG_USER_ID: "444", META_GRAPH_URL: `${G}/v` });
const req = (path: string, init: RequestInit = {}) => new Request(`https://conector.test${path}`, init);
const post = (path: string, body: unknown) => req(path, { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(body) });
const signed = (payload: unknown, secret = "secreto-app") => {
  const raw = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return req("/webhook/meta", { method: "POST", headers: { "x-hub-signature-256": `sha256=${sig}`, "content-type": "application/json" }, body: raw });
};
const waInbound = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ value: { contacts: [{ wa_id: "5218111111111", profile: { name: "Ana Cliente" } }], messages: [{ from: "5218111111111", id, timestamp: "1760000000", type: "text", text: { body: text }, ...extra }] } }] }],
});

describe("conector · webhook de Meta", () => {
  it("verificación GET solo con el token correcto", async () => {
    const ok = await handle(req("/webhook/meta?hub.mode=subscribe&hub.verify_token=verifica&hub.challenge=123"), env(), memStore());
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("123");
    const bad = await handle(req("/webhook/meta?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=123"), env(), memStore());
    expect(bad.status).toBe(403);
  });

  it("rechaza mensajes sin firma válida y guarda los firmados una sola vez", async () => {
    const store = memStore();
    const forged = await handle(signed(waInbound("wamid.IN1", "hola"), "otro-secreto"), env(), store);
    expect(forged.status).toBe(401);
    expect(await store.get("inbox:index")).toBeNull();
    for (let i = 0; i < 2; i++) expect((await handle(signed(waInbound("wamid.IN1", "Hola, ¿cuánto cuesta el CR-V?")), env(), store)).status).toBe(200);
    const idx = await (await handle(req("/api/buzon?token=clave"), env(), store)).json();
    const conv = idx.conversations["wa:5218111111111"];
    expect(conv).toMatchObject({ channel: "wa", name: "Ana Cliente", lastDir: "in", lastText: "Hola, ¿cuánto cuesta el CR-V?", count: 1 });
    const msgs = await (await handle(req("/api/buzon/conversacion?token=clave&c=wa:5218111111111"), env(), store)).json();
    expect(msgs.messages).toHaveLength(1);
  });

  it("fotos entrantes guardan el id para descargarlas por el conector", async () => {
    const store = memStore();
    await handle(signed(waInbound("wamid.IMG", "", { type: "image", image: { id: "555", mime_type: "image/jpeg", caption: "mi INE" } })), env(), store);
    const msgs = (await (await handle(req("/api/buzon/conversacion?token=clave&c=wa:5218111111111"), env(), store)).json()).messages;
    expect(msgs[0]).toMatchObject({ type: "image", text: "mi INE", media: { id: "555", mime: "image/jpeg" } });
    const file = await handle(req("/api/media?token=clave&id=555"), env(), store);
    expect(file.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
  });

  it("Messenger: mensajes de la página llegan al mismo buzón", async () => {
    const store = memStore();
    await handle(signed({ object: "page", entry: [{ messaging: [{ sender: { id: "PSID1" }, timestamp: 1760000000000, message: { mid: "m1", text: "Me interesa el anuncio" } }] }] }), env(), store);
    const idx = (await (await handle(req("/api/buzon?token=clave"), env(), store)).json()).conversations;
    expect(idx["fb:PSID1"]).toMatchObject({ channel: "fb", lastText: "Me interesa el anuncio" });
  });
});

describe("conector · envíos y estado", () => {
  it("exige la clave de la app", async () => {
    expect((await handle(req("/api/buzon?token=mala"), env(), memStore())).status).toBe(401);
    expect((await handle(post("/api/enviar", { token: "mala", to: "1", text: "x" }), env(), memStore())).status).toBe(401);
  });

  it("envía texto por WhatsApp Cloud API, lo guarda y actualiza su estado", async () => {
    const store = memStore();
    calls.length = 0;
    const r = await (await handle(post("/api/enviar", { token: "clave", channel: "wa", to: "+52 1 81 1111 1111", text: "Hola Ana, con gusto" }), env(), store)).json();
    expect(r).toMatchObject({ ok: true, id: expect.stringMatching(/^wamid\.OUT\d+$/) });
    const call = calls.find((c) => c.path === "/v/111/messages")!;
    expect(call.auth).toBe("Bearer tok-wa");
    expect(JSON.parse(call.body)).toMatchObject({ messaging_product: "whatsapp", to: "5218111111111", type: "text", text: { body: "Hola Ana, con gusto" } });
    await handle(signed({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { statuses: [{ id: r.id, recipient_id: "5218111111111", status: "read" }] } }] }] }), env(), store);
    const msgs = (await (await handle(req("/api/buzon/conversacion?token=clave&c=wa:5218111111111"), env(), store)).json()).messages;
    expect(msgs[0]).toMatchObject({ dir: "out", text: "Hola Ana, con gusto", status: "read" });
  });

  it("plantillas aprobadas y envío de plantilla con parámetros", async () => {
    const store = memStore();
    const t = await (await handle(req("/api/wa/plantillas?token=clave"), env(), store)).json();
    expect(t.templates.map((x: { name: string }) => x.name)).toEqual(["hello_world"]);
    calls.length = 0;
    await handle(post("/api/enviar", { token: "clave", channel: "wa", to: "5218111111111", template: { name: "seguimiento", lang: "es_MX", params: ["Ana"] } }), env(), store);
    expect(JSON.parse(calls.find((c) => c.path === "/v/111/messages")!.body).template).toEqual({ name: "seguimiento", language: { code: "es_MX" }, components: [{ type: "body", parameters: [{ type: "text", text: "Ana" }] }] });
  });

  it("responde por Messenger con el token de la página", async () => {
    calls.length = 0;
    const r = await (await handle(post("/api/enviar", { token: "clave", channel: "fb", to: "PSID1", text: "¡Hola! ¿Qué versión te interesa?" }), env(), memStore())).json();
    expect(r.ok).toBe(true);
    const call = calls.find((c) => c.path === "/v/333/messages")!;
    expect(call.auth).toBe("Bearer tok-fb");
    expect(JSON.parse(call.body)).toMatchObject({ recipient: { id: "PSID1" }, messaging_type: "RESPONSE", message: { text: "¡Hola! ¿Qué versión te interesa?" } });
  });

  it("publica en la página con foto (multipart) y sin foto", async () => {
    const store = memStore();
    calls.length = 0;
    const png = "data:image/jpeg;base64,/9j/2Q==";
    const r1 = await (await handle(post("/api/facebook/publicar", { token: "clave", message: "Estrena tu CR-V", image: png }), env(), store)).json();
    expect(r1).toMatchObject({ ok: true, id: "333_99" });
    const photo = calls.find((c) => c.path === "/v/333/photos")!;
    expect(photo.type).toMatch(/multipart\/form-data/);
    expect(photo.body).toContain("Estrena tu CR-V");
    const r2 = await (await handle(post("/api/facebook/publicar", { token: "clave", message: "Ven a la agencia" }), env(), store)).json();
    expect(r2.id).toBe("333_100");
    const list = (await (await handle(req("/api/facebook/publicaciones?token=clave"), env(), store)).json()).posts;
    expect(list).toHaveLength(2);
  });

  it("estado comprueba los tokens contra Meta y avisa si fallan", async () => {
    const ok = await (await handle(req("/api/estado?token=clave"), env(), memStore())).json();
    expect(ok.whatsapp).toMatchObject({ configured: true, ok: true, phone: "+52 81 0000 0000", name: "Agencia Prueba" });
    expect(ok.facebook).toMatchObject({ configured: true, ok: true, name: "Página Prueba" });
    expect(ok.instagram).toMatchObject({ configured: true, ok: true, username: "agencia.prueba" });
    expect(ok.agente).toMatchObject({ activo: false, reglas: 0, ultimoError: null });
    expect(ok.prospectos).toEqual({ nuevos: 0 });
    expect(ok.programadas).toEqual({ pendientes: 0, conError: 0 });
    const bad = await (await handle(req("/api/estado?token=clave"), { ...env(), WA_TOKEN: "vencido" }, memStore())).json();
    expect(bad.whatsapp).toMatchObject({ configured: true, ok: false, error: "Invalid OAuth access token" });
  });

  it("datos: guarda, conserva la versión anterior y responde meta", async () => {
    const store = memStore();
    const backup = { app: "sofia-prueba", state: { customers: [] } };
    await handle(post("/api/datos", { token: "clave", backup }), env(), store);
    await handle(post("/api/datos", { token: "clave", backup: { ...backup, v: 2 } }), env(), store);
    expect(await store.get("datos:prev")).toMatchObject({ backup });
    const meta = await (await handle(req("/api/datos?token=clave&meta=1"), env(), store)).json();
    expect(meta.updatedAt).toBeTruthy();
    expect(meta.backup).toBeUndefined();
  });
});

// ───────── Agente sin IA ─────────
// Monterrey no cambia de horario: UTC-6 todo el año.
const LUNES_10 = "2026-10-12T16:00:00.000Z"; // lunes 10:00 en Monterrey (dentro de horario)
const LUNES_21 = "2026-10-13T03:00:00.000Z"; // lunes 21:00 en Monterrey (fuera de horario)
const DOMINGO_10 = "2026-10-11T16:00:00.000Z"; // domingo: no está en los días de atención
const mas = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();
const CLIENTA = "5218122222222";
const waMsg = (id: string, text: string, iso: string, o: { from?: string; name?: string; type?: string; extra?: Record<string, unknown>; metadata?: Record<string, unknown> } = {}) => {
  const from = o.from ?? CLIENTA;
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      ...(o.metadata ? { metadata: o.metadata } : {}),
      contacts: [{ wa_id: from, profile: { name: o.name ?? "LUCÍA Prueba" } }],
      messages: [{ from, id, timestamp: String(Math.floor(Date.parse(iso) / 1000)), type: o.type ?? "text", ...(o.type && o.type !== "text" ? {} : { text: { body: text } }), ...(o.extra ?? {}) }],
    } }] }],
  };
};
const agente = (extra: Record<string, unknown> = {}) => ({
  activo: true, asesor: "Pedro", agencia: "Honda Ejemplo", esperaHoras: 12,
  bienvenida: "¡Hola {nombre}! Soy {asesor} de {agencia}.",
  fueraDeHorario: "Gracias {nombre}, te contesto mañana a partir de las 9.",
  reglas: [{ palabras: ["precio", "cuánto cuesta"], respuesta: "Los precios están en la lista de {agencia}." }, { palabras: ["ubicación"], respuesta: "Estamos en Av. Ejemplo 123." }],
  ...extra,
});
const configurar = async (store: ReturnType<typeof memStore>, config: Record<string, unknown>, e = env()) => handle(post("/api/agente/config", { token: "clave", config }), e, store);
const waEnvios = () => calls.filter((c) => c.path === "/v/111/messages").map((c) => JSON.parse(c.body) as { to: string; text: { body: string } });
const charla = async (store: ReturnType<typeof memStore>, c = `wa:${CLIENTA}`) => (await (await handle(req(`/api/buzon/conversacion?token=clave&c=${c}`), env(), store)).json()).messages as { dir: string; text: string; auto?: boolean; type: string }[];

describe("conector · agente sin IA (respuestas automáticas)", () => {
  it("configuración: valores por defecto, guardado parcial y validación", async () => {
    const store = memStore();
    const def = (await (await handle(req("/api/agente/config?token=clave"), env(), store)).json()).config;
    expect(def).toMatchObject({ activo: false, zonaHoraria: "America/Monterrey", horario: { dias: [1, 2, 3, 4, 5, 6], inicio: "09:00", fin: "19:00" }, reglas: [], esperaHoras: 12 });
    const r = await (await configurar(store, { activo: true, horario: { inicio: "10:00" }, reglas: [{ palabras: "precio, enganche", respuesta: "Con gusto" }] })).json();
    expect(r.config).toMatchObject({ activo: true, horario: { dias: [1, 2, 3, 4, 5, 6], inicio: "10:00", fin: "19:00" }, reglas: [{ palabras: ["precio", "enganche"], respuesta: "Con gusto" }] });
    const r2 = await (await configurar(store, { asesor: "Pedro" })).json();
    expect(r2.config).toMatchObject({ activo: true, asesor: "Pedro", horario: { inicio: "10:00" } });
    const zona = await configurar(store, { zonaHoraria: "Marte/Olimpo" });
    expect(zona.status).toBe(400);
    expect((await zona.json()).error).toMatch(/Zona horaria/);
    expect((await configurar(store, { horario: { inicio: "9am" } })).status).toBe(400);
    expect((await configurar(store, { reglas: [{ palabras: ["precio"], respuesta: "" }] })).status).toBe(400);
    // Días inválidos no se tiran en silencio (quedaría "siempre fuera de horario"); 7 también es domingo.
    expect((await configurar(store, { horario: { dias: ["lunes", "martes"] } })).status).toBe(400);
    expect((await (await configurar(store, { horario: { dias: [7, "1", 1] } })).json()).config.horario.dias).toEqual([0, 1]);
    expect((await handle(post("/api/agente/config", { token: "mala", config: {} }), env(), store)).status).toBe(401);
    expect((await (await handle(req("/api/agente/config?token=clave"), env(), store)).json()).config.horario.inicio).toBe("10:00");
  });

  it("bienvenida en el primer contacto con variables, marcada auto, y guarda el prospecto", async () => {
    const store = memStore();
    await configurar(store, agente());
    calls.length = 0;
    const res = await handle(signed(waMsg("wamid.A1", "Hola, quiero información", LUNES_10)), env(), store, { ahora: LUNES_10 });
    expect(res.status).toBe(200);
    expect(waEnvios()).toEqual([expect.objectContaining({ to: CLIENTA, type: "text", text: expect.objectContaining({ body: "¡Hola Lucía! Soy Pedro de Honda Ejemplo." }) })]);
    const msgs = await charla(store);
    expect(msgs.map((m) => [m.dir, Boolean(m.auto)])).toEqual([["in", false], ["out", true]]);
    // Segundo mensaje sin palabra clave y dentro de horario: el asesor contesta, el agente no.
    await handle(signed(waMsg("wamid.A2", "¿me ayudas?", mas(LUNES_10, 5))), env(), store, { ahora: mas(LUNES_10, 5) });
    expect(waEnvios()).toHaveLength(1);
    const leads = (await (await handle(req("/api/prospectos?token=clave"), env(), store)).json()).prospectos;
    expect(leads).toEqual([{ clave: `wa:${CLIENTA}`, canal: "wa", id: CLIENTA, nombre: "LUCÍA Prueba", primerMensaje: "Hola, quiero información", at: LUNES_10, importado: false }]);
  });

  it("fuera de horario (reloj controlado) y no repite la misma respuesta dentro de esperaHoras", async () => {
    const store = memStore();
    await configurar(store, agente({ bienvenida: "" }));
    calls.length = 0;
    const llega = (id: string, texto: string, iso: string) => handle(signed(waMsg(id, texto, iso)), env(), store, { ahora: iso });
    await llega("wamid.F1", "¿Siguen abiertos?", LUNES_21);
    expect(waEnvios().map((x) => x.text.body)).toEqual(["Gracias Lucía, te contesto mañana a partir de las 9."]);
    await llega("wamid.F2", "Hola??", mas(LUNES_21, 60)); // 1 h después: no se repite
    await llega("wamid.F3", "Buenos días", mas(LUNES_21, 13 * 60)); // martes 10:00: ya en horario
    expect(waEnvios()).toHaveLength(1);
    await llega("wamid.F4", "Hola otra vez", mas(LUNES_21, 25 * 60)); // martes 22:00: pasaron más de 12 h
    expect(waEnvios()).toHaveLength(2);
    // El domingo no está en los días de atención.
    expect((await (await handle(req("/api/estado?token=clave"), env(), store, { ahora: DOMINGO_10 })).json()).agente).toMatchObject({ activo: true, enHorario: false, reglas: 2 });
    expect((await (await handle(req("/api/estado?token=clave"), env(), store, { ahora: LUNES_10 })).json()).agente.enHorario).toBe(true);
  });

  it("reglas por palabra: sin acentos ni mayúsculas, palabra completa, sin repetir", async () => {
    const store = memStore();
    await configurar(store, agente({ bienvenida: "" }));
    calls.length = 0;
    const llega = (id: string, texto: string, min: number) => handle(signed(waMsg(id, texto, mas(LUNES_10, min))), env(), store, { ahora: mas(LUNES_10, min) });
    await llega("wamid.R1", "¿Cuál es el PRECIO del CR-V?", 0);
    await llega("wamid.R2", "¿Y los precios de seguros?", 1); // "precios" no es la palabra "precio"
    await llega("wamid.R3", "y la ubicacion?", 2); // sin acento coincide con "ubicación"
    await llega("wamid.R4", "cuanto cuesta entonces", 3); // misma respuesta que R1: no se repite
    expect(waEnvios().map((x) => x.text.body)).toEqual(["Los precios están en la lista de Honda Ejemplo.", "Estamos en Av. Ejemplo 123."]);
    expect((await charla(store)).filter((m) => m.auto)).toHaveLength(2);
  });

  it("no contesta reintentos de Meta, estados, reacciones, ecos ni mensajes propios", async () => {
    const store = memStore();
    await configurar(store, agente());
    calls.length = 0;
    const opts = { ahora: LUNES_10 };
    for (let i = 0; i < 3; i++) expect((await handle(signed(waMsg("wamid.D1", "precio", LUNES_10)), env(), store, opts)).status).toBe(200);
    expect(waEnvios()).toHaveLength(1); // solo la bienvenida, una vez
    await handle(signed({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { statuses: [{ id: "wamid.OUT1", recipient_id: CLIENTA, status: "read" }] } }] }] }), env(), store, opts);
    await handle(signed(waMsg("wamid.D2", "", LUNES_10, { from: "5218133333333", type: "reaction", extra: { reaction: { message_id: "x", emoji: "👍" } } })), env(), store, opts);
    await handle(signed(waMsg("wamid.D3", "precio", LUNES_10, { from: "528100000000", metadata: { display_phone_number: "52 81 0000 0000" } })), env(), store, opts);
    expect(waEnvios()).toHaveLength(1);
    expect((await (await handle(req("/api/prospectos?token=clave"), env(), store)).json()).prospectos.map((l: { id: string }) => l.id).sort()).toEqual([CLIENTA, "5218133333333"]); // el número propio no es prospecto
    await handle(signed({ object: "page", entry: [{ messaging: [
      { sender: { id: "333" }, recipient: { id: "PSID2" }, timestamp: Date.parse(LUNES_10), message: { mid: "e1", text: "precio", is_echo: true } },
      { sender: { id: "333" }, recipient: { id: "PSID2" }, timestamp: Date.parse(LUNES_10), message: { mid: "e2", text: "precio" } },
    ] }] }), env(), store, opts);
    expect(calls.filter((c) => c.path === "/v/333/messages")).toHaveLength(0);
  });

  it("si el envío automático falla, Meta recibe 200 y el error queda registrado", async () => {
    const store = memStore();
    const malo = { ...env(), WA_TOKEN: "vencido" };
    await configurar(store, agente(), malo);
    const res = await handle(signed(waMsg("wamid.X1", "Hola", LUNES_10)), malo, store, { ahora: LUNES_10 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await charla(store)).map((m) => m.dir)).toEqual(["in"]);
    const st = await (await handle(req("/api/estado?token=clave"), malo, store, { ahora: LUNES_10 })).json();
    expect(st.agente.ultimoError).toMatchObject({ canal: "wa", id: CLIENTA, error: "Invalid OAuth access token" });
  });

  it("Messenger: pide el nombre del perfil y contesta por la página", async () => {
    const store = memStore();
    await configurar(store, agente({ bienvenida: "¡Hola {nombre}! Gracias por escribir a {agencia}." }));
    calls.length = 0;
    await handle(signed({ object: "page", entry: [{ messaging: [{ sender: { id: "PSID9" }, timestamp: Date.parse(LUNES_10), message: { mid: "m9", text: "Me interesa el anuncio" } }] }] }), env(), store, { ahora: LUNES_10 });
    const envio = calls.find((c) => c.path === "/v/333/messages")!;
    expect(JSON.parse(envio.body)).toMatchObject({ recipient: { id: "PSID9" }, messaging_type: "RESPONSE", message: { text: "¡Hola Luis! Gracias por escribir a Honda Ejemplo." } });
    const msgs = await charla(store, "fb:PSID9");
    expect(msgs[1]).toMatchObject({ dir: "out", auto: true });
    // El botón "Empezar" (postback) cuenta como mensaje del cliente: se guarda y puede activar una regla.
    await handle(signed({ object: "page", entry: [{ messaging: [{ sender: { id: "PSID9" }, timestamp: Date.parse(mas(LUNES_10, 2)), postback: { mid: "pb1", title: "Ver precio" } }] }] }), env(), store, { ahora: mas(LUNES_10, 2) });
    expect((await charla(store, "fb:PSID9")).map((m) => m.text)).toEqual(["Me interesa el anuncio", "¡Hola Luis! Gracias por escribir a Honda Ejemplo.", "Ver precio", "Los precios están en la lista de Honda Ejemplo."]);
    const leads = (await (await handle(req("/api/prospectos?token=clave"), env(), store)).json()).prospectos;
    expect(leads[0]).toMatchObject({ clave: "fb:PSID9", canal: "fb", nombre: "Luis Prueba", primerMensaje: "Me interesa el anuncio" });
  });

  it("apagado no contesta (pero guarda el prospecto) y se calla si el asesor acaba de contestar a mano", async () => {
    const store = memStore();
    calls.length = 0;
    await handle(signed(waMsg("wamid.P0", "precio", LUNES_10, { from: "5218144444444" })), env(), store, { ahora: LUNES_10 });
    expect(waEnvios()).toHaveLength(0);
    expect((await (await handle(req("/api/prospectos?token=clave"), env(), store)).json()).prospectos).toHaveLength(1);

    await configurar(store, agente());
    calls.length = 0;
    // El asesor escribe primero (desde la app) a un número nuevo: no es prospecto ni recibe bienvenida.
    await handle(post("/api/enviar", { token: "clave", channel: "wa", to: CLIENTA, text: "Hola, te escribo de la agencia" }), env(), store, { ahora: LUNES_10 });
    await handle(signed(waMsg("wamid.P1", "¿Y el precio?", mas(LUNES_10, 10))), env(), store, { ahora: mas(LUNES_10, 10) });
    expect(waEnvios()).toHaveLength(1); // solo el mensaje manual
    await handle(signed(waMsg("wamid.P2", "¿Me dices el precio?", mas(LUNES_10, 45))), env(), store, { ahora: mas(LUNES_10, 45) });
    expect(waEnvios().map((x) => x.text.body)).toEqual(["Hola, te escribo de la agencia", "Los precios están en la lista de Honda Ejemplo."]);
    expect((await (await handle(req("/api/prospectos?token=clave"), env(), store)).json()).prospectos.map((l: { id: string }) => l.id)).toEqual(["5218144444444"]);
  });

  it("México: el asesor escribe a 52 + 10 dígitos y el cliente contesta desde 521: es la misma conversación", async () => {
    const store = memStore();
    await configurar(store, agente());
    calls.length = 0;
    await handle(post("/api/enviar", { token: "clave", channel: "wa", to: "528122222222", text: "Hola, te escribo de la agencia" }), env(), store, { ahora: LUNES_10 });
    await handle(signed(waMsg("wamid.MX1", "Gracias, ¿qué precio tiene?", mas(LUNES_10, 5))), env(), store, { ahora: mas(LUNES_10, 5) });
    expect(waEnvios().map((x) => x.text.body)).toEqual(["Hola, te escribo de la agencia"]); // ni bienvenida ni regla: el asesor está atendiendo
    expect(Object.keys((await (await handle(req("/api/buzon?token=clave"), env(), store)).json()).conversations)).toEqual([`wa:${CLIENTA}`]);
    expect((await (await handle(req("/api/prospectos?token=clave"), env(), store)).json()).prospectos).toEqual([]);
  });

  it("no contesta mensajes de más de 24 h (Meta los entregó tarde), pero sí los guarda", async () => {
    const store = memStore();
    await configurar(store, agente());
    calls.length = 0;
    await handle(signed(waMsg("wamid.V1", "precio", LUNES_10)), env(), store, { ahora: mas(LUNES_10, 24 * 60 + 1) });
    expect(waEnvios()).toHaveLength(0);
    expect((await charla(store)).map((m) => m.text)).toEqual(["precio"]);
  });

  it("esperaHoras nunca baja de 1 h: otro contestador automático no arma un bucle", async () => {
    const store = memStore();
    expect((await (await configurar(store, agente({ bienvenida: "", esperaHoras: 0 }))).json()).config.esperaHoras).toBe(1);
    calls.length = 0;
    // Otro negocio con contestador automático responde al instante a cada mensaje nuestro, fuera de horario.
    for (let i = 0; i < 6; i++) await handle(signed(waMsg(`wamid.B${i}`, "Gracias por tu mensaje, en breve te atendemos", mas(LUNES_21, i))), env(), store, { ahora: mas(LUNES_21, i) });
    expect(waEnvios()).toHaveLength(1);
  });

  it("variables: un perfil que no es nombre (liga, {agencia}, 200 letras) no se repite; {Nombre} con mayúscula funciona", async () => {
    const store = memStore();
    await configurar(store, agente({ bienvenida: "{Nombre}, gracias por escribir a {agencia}." }));
    calls.length = 0;
    const llega = (id: string, from: string, name: string) => handle(signed(waMsg(id, "hola", LUNES_10, { from, name })), env(), store, { ahora: LUNES_10 });
    await llega("wamid.N1", "5218170000001", "{asesor}{agencia}");
    await llega("wamid.N2", "5218170000002", "https://liga.ejemplo/promo Ana");
    await llega("wamid.N3", "5218170000003", "A".repeat(200));
    await llega("wamid.N4", "5218170000004", "josé luis");
    const neutro = "Gracias por escribir a Honda Ejemplo.";
    expect(waEnvios().map((x) => x.text.body)).toEqual([neutro, neutro, neutro, "José, gracias por escribir a Honda Ejemplo."]);
  });

  it("un aviso sin fecha no rompe el webhook: se usa la hora de llegada", async () => {
    const store = memStore();
    const sinFecha = waMsg("wamid.T1", "hola", LUNES_10, { extra: { timestamp: undefined } }); // JSON.stringify lo omite
    expect((await handle(signed(sinFecha), env(), store, { ahora: LUNES_21 })).status).toBe(200);
    expect((await handle(signed({ object: "page", entry: [{ messaging: [{ sender: { id: "PSID7" }, message: { mid: "m7", text: "hola" } }] }] }), env(), store, { ahora: LUNES_21 })).status).toBe(200);
    expect((await store.get("inbox:index"))[`wa:${CLIENTA}`].lastAt).toBe(LUNES_21);
    expect((await store.get("inbox:index"))["fb:PSID7"].lastAt).toBe(LUNES_21);
  });

  it("horario: turno que cruza la medianoche y cambio de horario de verano (Tijuana)", async () => {
    const store = memStore();
    await configurar(store, { zonaHoraria: "America/Tijuana", horario: { dias: [0, 1, 2, 3, 4, 5, 6], inicio: "22:00", fin: "06:00" } });
    const en = async (iso: string) => (await (await handle(req("/api/estado?token=clave"), env(), store, { ahora: iso })).json()).agente.enHorario;
    // Tijuana: UTC-7 hasta el domingo 1 de noviembre de 2026; después UTC-8.
    expect(await en("2026-10-31T05:30:00.000Z")).toBe(true); // viernes 22:30
    expect(await en("2026-10-31T13:30:00.000Z")).toBe(false); // sábado 06:30
    expect(await en("2026-11-02T13:30:00.000Z")).toBe(true); // lunes 05:30 (con UTC-7 serían las 06:30)
    expect(await en("2026-11-02T06:00:00.000Z")).toBe(true); // domingo 22:00
    expect(await en("2026-11-02T05:30:00.000Z")).toBe(false); // domingo 21:30
  });
});

describe("conector · prospectos", () => {
  it("lista del más nuevo al más viejo y la app los marca como importados", async () => {
    const store = memStore();
    await handle(signed(waMsg("wamid.L1", "Hola", LUNES_10, { from: "5218155555555", name: "Persona Uno" })), env(), store, { ahora: LUNES_10 });
    await handle(signed(waMsg("wamid.L2", "", mas(LUNES_10, 5), { from: "5218166666666", name: "Persona Dos", type: "image", extra: { image: { id: "777", mime_type: "image/jpeg" } } })), env(), store, { ahora: mas(LUNES_10, 5) });
    const lista = (await (await handle(req("/api/prospectos?token=clave"), env(), store)).json()).prospectos;
    expect(lista.map((l: { clave: string; primerMensaje: string }) => [l.clave, l.primerMensaje])).toEqual([["wa:5218166666666", "[image]"], ["wa:5218155555555", "Hola"]]);
    expect((await (await handle(req("/api/estado?token=clave"), env(), store)).json()).prospectos).toEqual({ nuevos: 2 });
    const r = await (await handle(post("/api/prospectos/marcar", { token: "clave", ids: ["wa:5218155555555", "wa:no-existe"] }), env(), store, { ahora: LUNES_21 })).json();
    expect(r).toEqual({ ok: true, marcados: 1 });
    expect((await (await handle(post("/api/prospectos/marcar", { token: "clave", ids: ["wa:5218155555555"] }), env(), store)).json()).marcados).toBe(0);
    const despues = (await (await handle(req("/api/prospectos?token=clave"), env(), store)).json()).prospectos;
    expect(despues.find((l: { clave: string }) => l.clave === "wa:5218155555555")).toMatchObject({ importado: true, importadoAt: LUNES_21 });
    expect((await handle(post("/api/prospectos/marcar", { token: "clave", ids: "todos" }), env(), store)).status).toBe(400);
  });

  it("marcar no toca el prototipo de los objetos (\"__proto__\" no es un prospecto)", async () => {
    const r = await (await handle(post("/api/prospectos/marcar", { token: "clave", ids: ["__proto__", "constructor", 5] }), env(), memStore())).json();
    expect(r).toEqual({ ok: true, marcados: 0 });
    expect(({} as Record<string, unknown>).importado).toBeUndefined();
  });
});

// ───────── Programador de publicaciones ─────────
const JPG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
const JPG_BYTES = Buffer.from("/9j/4AAQSkZJRgABAQ==", "base64");
const PUBLICA = "https://sofia.ejemplo.mx";
const programarEn = (store: ReturnType<typeof memStore>, p: Record<string, unknown>, e: Record<string, string> = { ...env(), PUBLIC_URL: PUBLICA }, ahora = LUNES_10) =>
  handle(post("/api/social/programar", { token: "clave", post: p }), e, store, { ahora });

describe("conector · programador de publicaciones", () => {
  it("valida la publicación antes de guardarla", async () => {
    const store = memStore();
    const error = async (p: Record<string, unknown>, e?: Record<string, string>) => {
      const r = await programarEn(store, p, e);
      expect(r.status).toBe(400);
      return (await r.json()).error as string;
    };
    expect(await error({ texto: "Hola", cuando: mas(LUNES_10, 60), canales: ["instagram"] })).toMatch(/solo publica con foto/);
    expect(await error({ texto: "Hola", imagen: "data:image/png;base64,iVBORw0KGgo=", cuando: mas(LUNES_10, 60), canales: ["instagram"] })).toMatch(/JPG/);
    expect(await error({ texto: "Hola", imagen: "data:image/svg+xml;base64,PHN2Zz4=", cuando: mas(LUNES_10, 60), canales: ["facebook"] })).toMatch(/JPG, PNG o GIF/);
    expect(await error({ texto: "", cuando: mas(LUNES_10, 60), canales: ["facebook"] })).toMatch(/vacía/);
    expect(await error({ texto: "Hola", cuando: "mañana", canales: ["facebook"] })).toMatch(/Fecha/);
    expect(await error({ texto: "Hola", cuando: mas(LUNES_10, 60), canales: ["tiktok"] })).toMatch(/Facebook, Instagram/);
    const sinIg: Record<string, string> = { ...env() };
    delete sinIg.IG_USER_ID;
    expect(await error({ texto: "Hola", imagen: JPG, cuando: mas(LUNES_10, 60), canales: ["instagram"] }, sinIg)).toMatch(/IG_USER_ID/);
    // Servidor en casa sin túnel ni PUBLIC_URL: Meta no podría descargar la foto, se avisa de una vez.
    const enCasa = new Request("http://192.168.1.20:8091/api/social/programar", { method: "POST", body: JSON.stringify({ token: "clave", post: { texto: "Hola", imagen: JPG, cuando: mas(LUNES_10, 60), canales: ["instagram"] } }) });
    const r = await handle(enCasa, env(), store, { ahora: LUNES_10 });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/PUBLIC_URL/);
    expect(await store.get("social:cola")).toBeNull();
  });

  it("guarda en la cola, sirve la foto en /media sin clave y se puede cancelar", async () => {
    const store = memStore();
    const { item } = await (await programarEn(store, { texto: "Estrena tu HR-V", imagen: JPG, cuando: mas(LUNES_10, 120), canales: ["facebook", "instagram"] })).json();
    expect(item).toMatchObject({ estado: "pendiente", intentos: 0, canales: ["facebook", "instagram"], cuando: mas(LUNES_10, 120) });
    expect(item.imagen).toBe(`${PUBLICA}/media/${item.mediaId}`);
    const cola = (await (await handle(req("/api/social/cola?token=clave"), env(), store)).json()).cola;
    expect(cola).toHaveLength(1);
    expect(JSON.stringify(cola)).not.toContain("4AAQSkZJRgABAQ"); // la foto no viaja en la lista
    expect(cola[0].imagen).toBe(`https://conector.test/media/${item.mediaId}`); // sin PUBLIC_URL: la dirección de la petición
    const foto = await handle(req(`/media/${item.mediaId}`), env(), store);
    expect(foto.status).toBe(200);
    expect(foto.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await foto.arrayBuffer())).toEqual(JPG_BYTES);
    expect((await handle(req("/media/..%2F..%2Fdatos"), env(), store)).status).toBe(404);
    expect((await handle(req("/media/0123456789abcdef0123456789abcdef"), env(), store)).status).toBe(404);
    expect((await handle(post("/api/social/cancelar", { token: "clave", id: item.id }), env(), store)).status).toBe(200);
    expect((await (await handle(req("/api/social/cola?token=clave"), env(), store)).json()).cola).toEqual([]);
    expect((await handle(req(`/media/${item.mediaId}`), env(), store)).status).toBe(404);
    expect((await handle(post("/api/social/cancelar", { token: "clave", id: item.id }), env(), store)).status).toBe(404);
  });

  it("runScheduled publica lo vencido en Facebook (foto) e Instagram (contenedor → publicar), una sola vez", async () => {
    const store = memStore();
    const e = { ...env(), PUBLIC_URL: `${PUBLICA}/` };
    const { item } = await (await programarEn(store, { texto: "Estrena tu HR-V", imagen: JPG, cuando: mas(LUNES_10, 120), canales: ["facebook", "instagram"] }, e)).json();
    calls.length = 0;
    const antes = store.escrituras;
    expect(await runScheduled(e, store, mas(LUNES_10, 60))).toMatchObject({ publicadas: 0 });
    expect(store.escrituras).toBe(antes); // nada vencido: no escribe (cuida el límite gratis de KV)
    expect(calls).toHaveLength(0);

    expect(await runScheduled(e, store, mas(LUNES_10, 121))).toMatchObject({ publicadas: 1, fallidas: 0 });
    const posts = calls.filter((c) => c.method === "POST").map((c) => c.path);
    expect(posts).toEqual(["/v/333/photos", "/v/444/media", "/v/444/media_publish"]);
    const photo = calls.find((c) => c.path === "/v/333/photos")!;
    expect(photo.type).toMatch(/multipart\/form-data/);
    expect(photo.body).toContain("Estrena tu HR-V");
    const contenedor = calls.find((c) => c.path === "/v/444/media")!;
    expect(contenedor.auth).toBe("Bearer tok-fb");
    expect(JSON.parse(contenedor.body)).toEqual({ image_url: `${PUBLICA}/media/${item.mediaId}`, caption: "Estrena tu HR-V" });
    expect(JSON.parse(calls.find((c) => c.path === "/v/444/media_publish")!.body)).toEqual({ creation_id: "cont1" });
    const [hecha] = (await (await handle(req("/api/social/cola?token=clave"), e, store)).json()).cola;
    expect(hecha).toMatchObject({ estado: "publicado", intentos: 1, resultados: { facebook: { ok: true, id: "333_99" }, instagram: { ok: true, id: "igpost1", url: "https://www.instagram.com/p/prueba1/" } } });
    calls.length = 0;
    await runScheduled(e, store, mas(LUNES_10, 200));
    expect(calls).toHaveLength(0);
  });

  it("si ya es hora, sale al momento (texto a Facebook)", async () => {
    const store = memStore();
    calls.length = 0;
    const { item } = await (await programarEn(store, { texto: "Hoy abrimos hasta las 8", cuando: mas(LUNES_10, -1), canales: ["facebook"] })).json();
    expect(item).toMatchObject({ estado: "publicado", resultados: { facebook: { ok: true, id: "333_100" } } });
    expect(JSON.parse(calls.find((c) => c.path === "/v/333/feed")!.body)).toEqual({ message: "Hoy abrimos hasta las 8" });
  });

  it("máximo 3 intentos, con espera entre ellos, sin repetir el canal que ya salió", async () => {
    const store = memStore();
    const e = { ...env(), IG_USER_ID: "445", PUBLIC_URL: PUBLICA }; // la API simulada no conoce 445: Instagram falla
    await programarEn(store, { texto: "Promoción", imagen: JPG, cuando: LUNES_10, canales: ["facebook", "instagram"] }, e, mas(LUNES_10, -10));
    calls.length = 0;
    const igIntentos = () => calls.filter((c) => c.path === "/v/445/media").length;
    await runScheduled(e, store, LUNES_10);
    let [x] = (await (await handle(req("/api/social/cola?token=clave"), e, store)).json()).cola;
    expect(x).toMatchObject({ estado: "pendiente", intentos: 1, siguiente: mas(LUNES_10, 5), resultados: { facebook: { ok: true }, instagram: { ok: false } } });
    await runScheduled(e, store, mas(LUNES_10, 1)); // todavía no toca reintentar
    expect(igIntentos()).toBe(1);
    await runScheduled(e, store, mas(LUNES_10, 5));
    await runScheduled(e, store, mas(LUNES_10, 15));
    await runScheduled(e, store, mas(LUNES_10, 60 * 24));
    expect(igIntentos()).toBe(3);
    expect(calls.filter((c) => c.path === "/v/333/photos")).toHaveLength(1);
    [x] = (await (await handle(req("/api/social/cola?token=clave"), e, store)).json()).cola;
    expect(x).toMatchObject({ estado: "error", intentos: 3, resultados: { facebook: { ok: true }, instagram: { ok: false, error: expect.stringContaining("ruta simulada desconocida") } } });
    expect((await (await handle(req("/api/estado?token=clave"), e, store)).json()).programadas).toEqual({ pendientes: 0, conError: 1 });
  });

  it("si la foto ya no está en el servidor, no publica solo el texto", async () => {
    const store = memStore();
    const { item } = await (await programarEn(store, { texto: "Estrena tu HR-V", imagen: JPG, cuando: mas(LUNES_10, 30), canales: ["facebook"] })).json();
    await store.put(`media:${item.mediaId}`, null);
    calls.length = 0;
    await runScheduled({ ...env(), PUBLIC_URL: PUBLICA }, store, mas(LUNES_10, 31));
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    const [x] = (await (await handle(req("/api/social/cola?token=clave"), env(), store)).json()).cola;
    expect(x.resultados.facebook).toMatchObject({ ok: false, error: expect.stringMatching(/foto ya no está/) });
  });

  it("Cloudflare: el cron llama al programador con el KV del Worker", async () => {
    const kv = new Map<string, string>();
    const SOFIA_KV = {
      async get(k: string, tipo?: string) { const v = kv.get(k); return v === undefined ? null : tipo === "json" ? JSON.parse(v) : v; },
      async put(k: string, v: string) { kv.set(k, v); },
      async delete(k: string) { kv.delete(k); },
    };
    const e = { ...env(), PUBLIC_URL: PUBLICA, SOFIA_KV };
    const cuando = new Date(Date.now() + 3600_000).toISOString();
    const r = await (await worker.fetch(post("/api/social/programar", { token: "clave", post: { texto: "Desde el cron", cuando, canales: ["facebook"] } }), e)).json();
    expect(r.item.estado).toBe("pendiente");
    calls.length = 0;
    const pendientes: Promise<unknown>[] = [];
    await worker.scheduled({ scheduledTime: Date.now() + 2 * 3600_000, cron: "*/5 * * * *" }, e, { waitUntil: (p: Promise<unknown>) => pendientes.push(p) });
    await Promise.all(pendientes);
    expect(JSON.parse(calls.find((c) => c.path === "/v/333/feed")!.body)).toEqual({ message: "Desde el cron" });
    expect(JSON.parse(kv.get("social:cola")!)[0].estado).toBe("publicado");
  });
});
