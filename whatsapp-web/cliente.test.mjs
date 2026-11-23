import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { vincular } from "./cliente.mjs";
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
  assert.doesNotReject(receptor.enviar({ to: self, text: "Sofía contesta" }));
});
