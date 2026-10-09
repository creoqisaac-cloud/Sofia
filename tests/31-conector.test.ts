/**
 * Conector de Sofía (prueba/servidor/core.mjs) contra una API de Meta SIMULADA (sin red real):
 * webhook con firma, buzón, envío por WhatsApp Cloud API, plantillas, archivos, Messenger y Facebook.
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error módulo JS sin tipos
import { handle } from "../prueba/servidor/core.mjs";

type Rec = { method: string; path: string; auth?: string; body: string; type?: string };
const calls: Rec[] = [];
let fake: http.Server;
let G = "";

const memStore = () => {
  const m = new Map<string, string>();
  return { async get(k: string) { return m.has(k) ? JSON.parse(m.get(k)!) : null; }, async put(k: string, v: unknown) { m.set(k, JSON.stringify(v)); } };
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
      if (path === "/v/111/messages") return send({ messages: [{ id: "wamid.OUT1" }] });
      if (path.startsWith("/v/222/message_templates")) return send({ data: [{ name: "hello_world", status: "APPROVED", language: "en_US" }, { name: "borrador", status: "PENDING" }] });
      if (path === "/v/555") return send({ url: `${G}/archivo/555`, mime_type: "image/jpeg" });
      if (path === "/archivo/555") { res.writeHead(200, { "content-type": "image/jpeg" }); return res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9])); }
      if (path.startsWith("/v/333?fields")) return send({ name: "Página Prueba", link: "https://facebook.com/prueba" });
      if (path === "/v/333/photos") return send({ id: "ph1", post_id: "333_99" });
      if (path === "/v/333/feed") return send({ id: "333_100" });
      if (path === "/v/333/messages") return send({ message_id: "m_out" });
      send({ error: { message: `ruta simulada desconocida ${path}` } }, 404);
    });
  });
  await new Promise<void>((r) => fake.listen(0, "127.0.0.1", () => r()));
  G = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
});
afterAll(() => fake.close());

const env = () => ({ SOFIA_TOKEN: "clave", META_APP_SECRET: "secreto-app", META_VERIFY_TOKEN: "verifica", WA_TOKEN: "tok-wa", WA_PHONE_NUMBER_ID: "111", WA_WABA_ID: "222", FB_PAGE_ID: "333", FB_PAGE_TOKEN: "tok-fb", META_GRAPH_URL: `${G}/v` });
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
    expect(r).toMatchObject({ ok: true, id: "wamid.OUT1" });
    const call = calls.find((c) => c.path === "/v/111/messages")!;
    expect(call.auth).toBe("Bearer tok-wa");
    expect(JSON.parse(call.body)).toMatchObject({ messaging_product: "whatsapp", to: "5218111111111", type: "text", text: { body: "Hola Ana, con gusto" } });
    await handle(signed({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { statuses: [{ id: "wamid.OUT1", recipient_id: "5218111111111", status: "read" }] } }] }] }), env(), store);
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
