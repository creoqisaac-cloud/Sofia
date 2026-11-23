import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { vincular, tiempoEscribiendo, rutaNavegador } from "./cliente.mjs";
import { eventoVinculado } from "../prueba/servidor/core.mjs";

test("QR, mensaje privado, respuesta de Sofía, duplicado e intervención del asesor", async () => {
  const datos = new Map();
  const store = { get: async k => datos.get(k), put: async (k, v) => datos.set(k, v) };
  const client = new EventEmitter();
  const enviados = [];
  const env = {};
  const peer = "528100000001";
  const chat = peer + "@c.us";
  client.info = { wid: { user: "528100000002" } };
  client.getNumberId = async n => ({ _serialized: n + "@c.us" });
  client.getContactLidAndPhone = async () => [{ pn: chat }];
  client.sendMessage = async (a, texto) => {
    enviados.push({ a, texto });
    return { id: { _serialized: "respuesta-" + enviados.length } };
  };
  const receptor = vincular(client, e => eventoVinculado(e, env, store), peer);
  env.WA_WEB = receptor;
  client.emit("qr", "codigo-sintetico");
  assert.match(await receptor.pagina(), /data:image\/png/);
  client.emit("ready");
  assert.equal(receptor.estado().ok, true);
  assert.doesNotMatch(await receptor.pagina(), /data:image/);
  const m = { type: "chat", body: "Hola", id: { _serialized: "cliente-1" }, timestamp: Math.floor(Date.now()/1000), from: "10@lid" };
  const emitir = async cambios => {
    client.emit("message_create", { ...m, ...cambios });
    await new Promise(resolve => setImmediate(resolve));
  };
  await emitir({ from: "123@g.us" });
  await emitir({ from: "528100009999@c.us" });
  assert.equal(enviados.length, 0);
  await emitir({});
  assert.ok(enviados.length > 0);
  assert.equal(enviados[0].a, chat);
  assert.ok(enviados[0].texto.length);
  const cantidad = enviados.length;
  await emitir({});
  await emitir({ fromMe: true, to: chat, body: "Yo lo atiendo", id: { _serialized: "asesor" } });
  await emitir({ id: { _serialized: "cliente-2" } });
  assert.equal(enviados.length, cantidad);
  client.emit("disconnected");
  assert.equal(receptor.estado().ok, false);
});

test("solo mi WhatsApp: responde a /sofia en chat propio, ignora notas y chats externos", async () => {
  const client = new EventEmitter();
  const eventos = [];
  const self = "528100000002";
  client.info = { wid: { user: self, _serialized: self + "@c.us" } };
  client.getNumberId = async n => ({ _serialized: n + "@c.us" });
  client.sendMessage = async () => ({ id: { _serialized: "respuesta-sintetica" } });
  const receptor = vincular(client, async e => { eventos.push(e); }, self, true);
  client.emit("ready");
  assert.equal(receptor.estado().modo, "solo-mi-whatsapp");
  const emitir = async (body, fromMe, to, from) => {
    client.emit("message_create", {
      type: "chat", body, fromMe, to, from,
      id: { _serialized: "m" + Math.random() }, timestamp: Math.floor(Date.now()/1000)
    });
    await new Promise(resolve => setImmediate(resolve));
  };
  await emitir("mi nota personal", true, self + "@c.us", self + "@c.us");
  await emitir("/sofia hola", false, self + "@c.us", "528100000003@c.us");
  await emitir("/sofia hola", true, "528100000003@c.us", self + "@c.us");
  assert.equal(eventos.length, 0);
  await emitir("/sofia hola", true, self + "@c.us", self + "@c.us");
  assert.equal(eventos.length, 1);
  const cambio = eventos[0].entry[0].changes[0];
  assert.equal(cambio.field, "messages");
  assert.equal(cambio.value.messages[0].pruebaLocal, true);
  assert.equal(cambio.value.messages[0].from, self);
  await assert.rejects(receptor.enviar({ to: "528100000003", text: "No debería salir" }), /Destinatario no habilitado/);
  await assert.doesNotReject(receptor.enviar({ to: self, text: "Sofía contesta" }));
});

test("como persona: «escribiendo…» antes de contestar, y la cita le llega al asesor en su chat «Tú»", async () => {
  const datos = new Map();
  const store = { get: async k => datos.get(k), put: async (k, v) => datos.set(k, v) };
  const client = new EventEmitter();
  const self = "5218111112222"; // el WhatsApp de Mario (vinculado)
  const peer = "528100000001"; // el único número de prueba autorizado
  const pasos = [];
  client.info = { wid: { user: self, _serialized: self + "@c.us" } };
  client.getNumberId = async n => ({ _serialized: n + "@c.us" });
  client.getChatById = async id => ({
    sendStateTyping: async () => { pasos.push("escribiendo " + id); },
    clearState: async () => { pasos.push("listo " + id); },
  });
  client.sendMessage = async (a, texto) => { pasos.push({ a, texto, at: Date.now() }); return { id: { _serialized: "sofia-" + pasos.length } }; };
  const env = {};
  const receptor = vincular(client, e => eventoVinculado(e, env, store), peer, false, { pausa: () => 40 });
  env.WA_WEB = receptor;
  client.emit("ready");
  const inicio = Date.now();
  await receptor.enviar({ to: peer, text: "Claro, te hago una corrida" });
  assert.deepEqual(pasos.map(x => typeof x === "string" ? x : "mensaje " + x.a), ["escribiendo " + peer + "@c.us", "mensaje " + peer + "@c.us", "listo " + peer + "@c.us"]);
  assert.ok(pasos[1].at - inicio >= 35, "espera antes de mandar");
  await assert.rejects(receptor.enviar({ to: "528100009999", text: "x" }), /Destinatario no habilitado/); // un cliente real, en prueba
  pasos.length = 0;
  await receptor.enviar({ to: self, text: "aviso" }); // el chat «Tú» del asesor siempre se permite, sin pausa
  assert.deepEqual(pasos.map(x => x.a), [self + "@c.us"]);

  // Plática completa desde el número de prueba: al tener cita y nombre, Mario recibe el aviso en su chat «Tú».
  pasos.length = 0;
  let n = 0;
  const cliente = async body => {
    client.emit("message_create", { type: "chat", body, from: peer + "@c.us", id: { _serialized: "c" + (++n) }, timestamp: Math.floor(Date.now() / 1000) });
    await new Promise(r => setTimeout(r, 150));
  };
  await cliente("Hola, precio del Civic");
  await cliente("como 80 mil");
  await cliente("1");
  await cliente("Luis Treviño");
  const aSofia = pasos.filter(x => typeof x !== "string" && x.a === peer + "@c.us").map(x => x.texto);
  assert.match(aSofia.at(-1), /Al llegar a la agencia pregunta por Mario Abarca para que vaya a recibirte/);
  const aviso = pasos.filter(x => typeof x !== "string" && x.a === self + "@c.us");
  assert.equal(aviso.length, 1);
  assert.match(aviso[0].texto, /^📅 Cita nueva: Luis Treviño · /);
  assert.match(aviso[0].texto, /Le interesa: Honda Civic\nCrédito · enganche \$80,000/);
});

test("tiempo escribiendo: de 1.2 a 8.4 segundos según el largo", () => {
  for (let i = 0; i < 50; i++) {
    const corto = tiempoEscribiendo("Va");
    const largo = tiempoEscribiendo("x".repeat(2000));
    assert.ok(corto >= 1200 && corto <= 2000, String(corto));
    assert.ok(largo >= 5600 && largo <= 8400, String(largo));
  }
});

test("navegador: si falta el de puppeteer, usa el Chrome o el Edge que ya tiene Windows", () => {
  const env = { PROGRAMFILES: "C:\\Program Files", "PROGRAMFILES(X86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\isaac\\AppData\\Local" };
  const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  assert.equal(rutaNavegador(env, p => p === edge, "win32"), edge);
  assert.equal(rutaNavegador(env, p => p === edge || p === chrome, "win32"), chrome);
  assert.equal(rutaNavegador({ ...env, CHROMIUM_PATH: "D:\\otro.exe" }, () => false, "win32"), "D:\\otro.exe");
  assert.equal(rutaNavegador(env, () => false, "win32"), undefined);
});

