import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { vincular, tiempoEscribiendo, rutaNavegador } from "./cliente.mjs";
import { eventoVinculado } from "../prueba/servidor/core.mjs";

test("prueba personal solo responde a comandos propios y evita el eco", async () => {
  const client = new EventEmitter();
  const peer = "528100000001";
  const self = peer + "@c.us";
  const otro = "528100000002@c.us";
  client.info = { wid: { user: peer, _serialized: self } };
  client.getNumberId = async n => ({ _serialized: n + "@c.us" });
  const data = new Map(), env = {}, enviados = [];
  const store = { get: async k => data.get(k), put: async (k,v) => data.set(k,v) };
  const emitir = (id, from, to, body) => client.emit("message_create", { fromMe: from === self, from, to, body, type: "chat", timestamp: Date.now()/1000, id: { _serialized: id } });
  client.sendMessage = async (to, text) => {
    enviados.push(to);
    emitir("out", self, to, text);
    return { id: { _serialized: "out" } };
  };
  env.WA_WEB = vincular(client, e => eventoVinculado(e, env, store), "", true);
  client.emit("ready");
  emitir("1", otro, self, "/sofia hola");
  emitir("2", self, otro, "/sofia hola");
  emitir("3", self, self, "nota normal");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(enviados, []);
  emitir("4", self, self, "/sofia Hola");
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(enviados.length);
  assert.ok(enviados.every(n => n === self));
  const conversaciones = [...data].filter(([k]) => k.startsWith("inbox:c:wa:"));
  const [claveConversacion, mensajes] = conversaciones[0];
  const indice = data.get("inbox:index");
  const idConversacion = claveConversacion.slice("inbox:c:".length);
  indice[idConversacion].venta = { paso: "asesor", desde: new Date().toISOString(), fallos: 2 };
  data.set("inbox:index", indice);
  emitir("5", self, self, "/sofia menú");
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(enviados.length >= 2, "un comando propio explícito debe reanudar una conversación pausada");
  assert.ok(data.get(claveConversacion).some(m => /¿Qué modelo traes en mente\?|¿Andas buscando sedán o camioneta\?|¿Cuál te late más\?/.test(m.text ?? "")));
  await assert.rejects(env.WA_WEB.enviar({ to: "528100000002", text: "prueba" }));
});

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

test("Mario: pendientes prioriza fijados y responder N usa exactamente la lista mostrada", async () => {
  const client = new EventEmitter();
  const self = "5218111112222@c.us";
  const enviados = [];
  const ordenes = [];
  let sincronizaciones = 0;
  client.info = { wid: { user: "5218111112222", _serialized: self } };
  client.getContactLidAndPhone = async (lids) => lids.map((lid) => ({ lid, pn: self }));
  client.sendMessage = async (to, text) => { enviados.push({ to, text }); return { id: { _serialized: `salida-${enviados.length}` } }; };
  const operaciones = {
    async pendientes() {
      sincronizaciones++;
      return { chats: 2, mensajes: 9, pendientes: [
        { clave: "wa:528100000001", id: "528100000001", nombre: "Ana", ultimoMensaje: "Precio del Civic", fijado: true },
        { clave: "wa:528100000002", id: "528100000002", nombre: "Luis", ultimoMensaje: "¿Lo tienes disponible?" },
      ] };
    },
    async responderPendiente(clave) { ordenes.push(clave); },
  };
  const receptor = vincular(client, async () => {}, "", false, { operaciones });
  client.emit("ready");
  const comando = async (id, body) => {
    client.emit("message_create", { type: "chat", body, fromMe: true, from: self, to: self, id: { _serialized: id }, timestamp: Math.floor(Date.now() / 1000) });
    await new Promise(resolve => setTimeout(resolve, 15));
  };
  await comando("orden-1", "/sofia pendientes");
  assert.equal(sincronizaciones, 1);
  assert.equal(ordenes.length, 0, "listar pendientes nunca envía respuestas a clientes");
  assert.match(enviados.at(-1).text, /1\. .*Ana/);
  assert.match(enviados.at(-1).text, /📌 Ana/);
  assert.match(enviados.at(-1).text, /\/sofia responder 1/);
  await comando("orden-2", "/sofia responder 2");
  assert.equal(sincronizaciones, 1, "responder usa la lista exacta que Sofía mostró");
  assert.deepEqual(ordenes, ["wa:528100000002"]);
  assert.equal(enviados.filter(x => x.text.startsWith("Voy a responder un solo chat:")).length, 1);
  await comando("orden-3", "/sofia responder 1");
  assert.deepEqual(ordenes, ["wa:528100000002", "wa:528100000001"], "el chat fijado que apareció como 1 es el que se responde");
  await comando("orden-4", "/sofia responder todos");
  assert.deepEqual(ordenes.length, 2, "con la lista vacía, «todos» no responde a nadie");
  assert.match(enviados.at(-1).text, /Primero escribe \/sofia pendientes/);
  await comando("orden-5", "/sofia pendientes");
  await comando("orden-6", "/sofia responder 1,2");
  assert.deepEqual(ordenes.slice(2), ["wa:528100000001", "wa:528100000002"], "varios: solo los números elegidos de la lista mostrada");
  assert.match(enviados.at(-1).text, /respondió 2 de 2/);
  await comando("orden-7", "/sofia pendientes");
  await comando("orden-8", "/sofia responder todos");
  assert.equal(ordenes.length, 6, "todos = exactamente los de la lista mostrada");
  client.emit("message_create", { type: "chat", body: "sofia ayuda", fromMe: true, from: self, to: "5218111112222@lid", id: { _serialized: "orden-lid" }, timestamp: Math.floor(Date.now() / 1000) });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.match(enviados.at(-1).text, /Órdenes de Sofía/);
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
  assert.match(aSofia.at(-1), /Al llegar a la agencia pregunta por mí, Mario Abarca, y salgo a recibirte/);
  const aviso = pasos.filter(x => typeof x !== "string" && x.a === self + "@c.us");
  assert.equal(aviso.length, 1);
  assert.match(aviso[0].texto, /^📅 CITA · Luis Treviño · /);
  assert.match(aviso[0].texto, /Vehículo: Honda Civic\nCrédito · enganche \$80,000/);
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


test("cliente nuevo con LID: si falla la primera consulta, usa el contacto y sí lo registra", async () => {
  const client = new EventEmitter();
  const self = "528100000003";
  client.info = { wid: { user: self, _serialized: self + "@c.us" } };
  client.getContactLidAndPhone = async (lids) => lids.map((lid) => ({ lid, pn: undefined }));
  client.getContactById = async () => ({ id: { server: "lid", _serialized: "77@lid" }, phoneNumber: "528100000777" });
  const eventos = [];
  vincular(client, async (e) => { eventos.push(e); }, "", false, { pausa: () => 0 });
  client.emit("ready");
  client.emit("message_create", { type: "chat", body: "Hola, ¿precio del City?", from: "77@lid", id: { _serialized: "lid-1" }, timestamp: Math.floor(Date.now() / 1000) });
  await new Promise((listo) => setTimeout(listo, 2000));
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].entry[0].changes[0].value.messages[0].from, "528100000777");
});

test("LID sin número: no se registra ni truena, solo deja aviso", async () => {
  const client = new EventEmitter();
  client.info = { wid: { user: "528100000004", _serialized: "528100000004@c.us" } };
  client.getContactLidAndPhone = async () => [];
  const eventos = [];
  vincular(client, async (e) => { eventos.push(e); }, "", false, { pausa: () => 0 });
  client.emit("ready");
  client.emit("message_create", { type: "chat", body: "Hola", from: "88@lid", id: { _serialized: "lid-2" }, timestamp: Math.floor(Date.now() / 1000) });
  await new Promise((listo) => setTimeout(listo, 2000));
  assert.equal(eventos.length, 0);
});

test("Mario: «sofia háblale a…» primero enseña a quién y qué; solo manda con «sofia sí»", async () => {
  const client = new EventEmitter();
  const self = "5218111112222@c.us";
  const enviados = [];
  let mandadas = 0;
  client.info = { wid: { user: "5218111112222", _serialized: self } };
  client.getContactLidAndPhone = async (lids) => lids.map((lid) => ({ lid, pn: self }));
  client.sendMessage = async (to, text) => { enviados.push({ to, text }); return { id: { _serialized: `salida-${enviados.length}` } }; };
  let pendiente = false;
  const operaciones = {
    async orden(texto) {
      pendiente = true;
      return { tipo: "mensaje", filtros: [`interesados en CR-V (${texto.length})`], destinatarios: [{ clave: "wa:5281", id: "5281", nombre: "Ana", motivo: "Honda CR-V 2027" }], recortados: 0, ejemplo: "¡Hola Ana! ¿Sigues interesada en la CR-V?", conFoto: false, avisoFoto: "" };
    },
    async mandarOrden() { if (!pendiente) throw new Error("No hay una orden por confirmar"); pendiente = false; mandadas++; return { ok: 1, total: 1, fallidos: [] }; },
    cancelarOrden() { const h = pendiente; pendiente = false; return h; },
  };
  vincular(client, async () => {}, "", false, { operaciones });
  client.emit("ready");
  const comando = async (id, body) => {
    client.emit("message_create", { type: "chat", body, fromMe: true, from: self, to: self, id: { _serialized: id }, timestamp: Math.floor(Date.now() / 1000) });
    await new Promise(resolve => setTimeout(resolve, 15));
  };
  await comando("libre-1", "Sofía, háblale a los interesados en CR-V");
  assert.equal(mandadas, 0, "la orden sola nunca manda");
  assert.match(enviados.at(-1).text, /📋 Entendí: escribirle a interesados en CR-V/);
  assert.match(enviados.at(-1).text, /• Ana \(CR-V 2027\)/);
  assert.match(enviados.at(-1).text, /sofia sí\* para mandar/);
  await comando("libre-2", "sofia no");
  assert.match(enviados.at(-1).text, /Cancelado: no mandé nada/);
  await comando("libre-3", "sofia sí");
  assert.equal(mandadas, 0);
  assert.match(enviados.at(-1).text, /No pude completar la orden: No hay una orden por confirmar/);
  await comando("libre-4", "sofia háblale a los de CR-V");
  await comando("libre-5", "sofia sí");
  assert.equal(mandadas, 1);
  assert.match(enviados.at(-1).text, /Listo: mandé 1 de 1\./);
});
