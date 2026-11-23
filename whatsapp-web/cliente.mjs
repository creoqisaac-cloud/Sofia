import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import QRCode from "qrcode";
import whatsapp from "whatsapp-web.js";

const require = createRequire(import.meta.url);

/**
 * El navegador para WhatsApp Web: el indicado en CHROMIUM_PATH, el que bajó puppeteer o, si no está,
 * el Chrome o Edge que ya tiene la computadora (Edge viene en todo Windows).
 */
export function rutaNavegador(env = process.env, existe = fs.existsSync, plataforma = process.platform) {
  if (env.CHROMIUM_PATH) return env.CHROMIUM_PATH;
  try {
    const propio = require("puppeteer").executablePath();
    if (propio && existe(propio)) return propio;
  } catch { /* sin el navegador de puppeteer */ }
  const pf = env.PROGRAMFILES || env.ProgramFiles || "C:\\Program Files";
  const pf86 = env["PROGRAMFILES(X86)"] || env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = env.LOCALAPPDATA || "";
  const candidatos = plataforma === "win32"
    ? [pf + "\\Google\\Chrome\\Application\\chrome.exe", pf86 + "\\Google\\Chrome\\Application\\chrome.exe", local && local + "\\Google\\Chrome\\Application\\chrome.exe",
      pf86 + "\\Microsoft\\Edge\\Application\\msedge.exe", pf + "\\Microsoft\\Edge\\Application\\msedge.exe"]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  return candidatos.filter(Boolean).find((p) => existe(p));
}

/** Lo que tardaría una persona en escribir ese texto (1.5 a 7 s, con algo de variación). */
export function tiempoEscribiendo(texto) {
  const base = Math.min(7000, 1500 + String(texto ?? "").length * 35);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

// opciones.pausa(texto) → milisegundos de «escribiendo…» antes de mandar cada respuesta (0 = al instante).
export function vincular(client, recibir, prueba = "", soloMiWhatsApp = false, { pausa = () => 0 } = {}) {
  // WhatsApp puede conservar el prefijo móvil mexicano 521 en contactos antiguos.
  const normalizar = n => String(n ?? "").replace(/^521(\d{10})$/, "52$1");
  const permitido = n => !prueba || normalizar(n) === normalizar(prueba);
  let qr = "";
  let conectado = false;
  let cola = Promise.resolve();
  client.on("qr", codigo => { qr = codigo; conectado = false; });
  client.on("ready", () => { conectado = true; qr = ""; });
  const desconectar = () => { conectado = false; qr = ""; };
  client.on("auth_failure", desconectar);
  client.on("disconnected", desconectar);

  async function procesar(m) {
    if (!conectado || m.type !== "chat" || !m.body || m.isStatus || !m.id?._serialized) return;
    const chat = m.fromMe ? m.to : m.from;
    if (!/^\d+@(c\.us|lid)$/.test(chat)) return;
    const propio = client.info?.wid?._serialized || (client.info?.wid?.user ? client.info.wid.user + "@c.us" : "");
    const esChatPropio = Boolean(propio) && chat === propio;
    // El modo personal ignora TODO chat externo. Solo acepta comandos escritos
    // por el dueño en el chat «Tú»; nunca escucha notas ni sus propias respuestas.
    if (soloMiWhatsApp && (!esChatPropio || !m.fromMe || !/^\/sofia(?:\s|$)/i.test(m.body.trim()))) return;
    if (!soloMiWhatsApp && esChatPropio) return;
    let telefono = chat;
    if (chat.endsWith("@lid")) {
      const [contacto] = await client.getContactLidAndPhone([chat]);
      telefono = contacto?.pn;
    }
    if (!/^\d+@c\.us$/.test(telefono)) return;
    const peer = telefono.split("@")[0];
    if ((!soloMiWhatsApp && peer === client.info?.wid?.user) || !permitido(peer)) return;
    const mensaje = { id: m.id._serialized, type: "text", timestamp: m.timestamp, text: { body: m.body }, ...(soloMiWhatsApp && esChatPropio ? { pruebaLocal: true } : {}) };
    const cambio = m.fromMe && !esChatPropio
      ? { field: "smb_message_echoes", value: { message_echoes: [{ ...mensaje, to: peer }] } }
      : { field: "messages", value: { messages: [{ ...mensaje, from: peer }] } };
    await recibir({ object: "whatsapp_business_account", entry: [{ changes: [cambio] }] });
  }
  const tipoMensaje = (m) => ({ chat: "text", ptt: "audio", vcard: "contact", multi_vcard: "contact" }[m.type] ?? m.type);
  async function sincronizarPendientes() {
    if (!conectado) throw new Error("WhatsApp está desconectado.");
    if (soloMiWhatsApp) throw new Error("La importación de chats no está disponible en el modo de prueba personal.");
    const limiteAntiguedad = Date.now() / 1000 - 30 * 24 * 60 * 60;
    const chats = (await client.getChats()).filter((c) => !c.isGroup && c.lastMessage && !c.lastMessage.fromMe && c.timestamp >= limiteAntiguedad && /^\d+@c\.us$/.test(c.id?._serialized ?? ""))
      .filter((c) => normalizar(c.id._serialized.split("@")[0]) !== normalizar(client.info?.wid?.user)).slice(0, 100);
    const changes = [];
    let mensajes = 0;
    for (const chat of chats) {
      try {
        const peer = chat.id._serialized.split("@")[0];
        const limite = Math.min(30, Math.max(5, Number(chat.unreadCount) + 3));
        const history = await chat.fetchMessages({ limit: limite });
        const contacto = await chat.getContact().catch(() => null);
        await etiquetar({ to: peer, etiquetas: ["Prospecto"] }).catch(() => {});
        for (const m of history) {
          if (m.isStatus || !m.id?._serialized || !m.timestamp) continue;
          const type = tipoMensaje(m);
          const base = { id: m.id._serialized, type, timestamp: m.timestamp };
          if (m.body) {
            if (type === "text") base.text = { body: m.body };
            else if (["image", "video", "audio", "document", "sticker"].includes(type)) base[type] = { caption: m.body };
          }
          if (m.fromMe) changes.push({ field: "smb_message_echoes", value: { message_echoes: [{ ...base, to: peer }] } });
          else changes.push({ field: "messages", value: { contacts: [{ wa_id: peer, profile: { name: contacto?.pushname || contacto?.name || "" } }], messages: [{ ...base, from: peer }] } });
          mensajes += 1;
        }
      } catch { /* una conversación no accesible no bloquea las demás */ }
    }
    return { body: { object: "whatsapp_business_account", entry: [{ changes }] }, chats: chats.length, mensajes };
  }
  async function etiquetar({ to, etiquetas = [] }) {
    if (!conectado || soloMiWhatsApp) return [];
    const destino = await client.getNumberId(String(to));
    if (!destino) return [];
    const chat = await client.getChatById(destino._serialized);
    const actuales = await chat.getLabels();
    const todas = await client.getLabels();
    const normal = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const aliases = { asesor: ["asesor", "atender asesor", "pendiente asesor"], cita: ["cita", "cita agendada", "visita"], caliente: ["caliente", "interes caliente", "prioridad"], prospecto: ["prospecto", "cliente potencial", "nuevo prospecto"] };
    const wanted = etiquetas.flatMap((x) => (aliases[normal(x)] ?? [normal(x)]));
    const found = todas.filter((l) => wanted.includes(normal(l.name)));
    if (found.length) await chat.changeLabels([...new Set([...actuales.map((l) => l.id), ...found.map((l) => l.id)])]);
    return found.map((l) => l.name);
  }
  client.on("message_create", m => {
    cola = cola.then(() => procesar(m)).catch(() => console.error("No se pudo procesar un mensaje del dispositivo vinculado."));
  });
  return {
    sincronizarPendientes,
    etiquetar,
    estado: () => ({ configured: true, ok: conectado, phone: conectado ? client.info?.wid?.user : null, modo: soloMiWhatsApp ? "solo-mi-whatsapp" : "web" }),
    async enviar({ to, text, image }) {
      if (!conectado) throw new Error("El dispositivo de WhatsApp está desconectado.");
      const self = client.info?.wid?.user;
      // El chat «Tú» del número vinculado siempre se permite: ahí le llegan al asesor los avisos de cada cita.
      const aMiMismo = Boolean(self) && normalizar(to) === normalizar(self);
      if (!/^\d{6,15}$/.test(to) || !(aMiMismo || permitido(to)) || (soloMiWhatsApp && !aMiMismo)) throw new Error("Destinatario no habilitado.");
      const destino = await client.getNumberId(to);
      if (!destino) throw new Error("WhatsApp no encontró el contacto.");
      const texto = [text, image].filter(Boolean).join("\n");
      // Como una persona: «escribiendo…» unos segundos y luego el mensaje (también baja el riesgo con WhatsApp).
      const espera = aMiMismo && !soloMiWhatsApp ? 0 : pausa(texto); // los avisos al asesor van al instante
      const chat = espera > 0 ? await client.getChatById?.(destino._serialized).catch(() => null) : null;
      if (espera > 0) {
        await chat?.sendStateTyping?.().catch(() => {});
        await new Promise((listo) => setTimeout(listo, espera));
      }
      const msg = await client.sendMessage(destino._serialized, texto, { sendSeen: false });
      await chat?.clearState?.().catch(() => {});
      return msg.id._serialized;
    },
    async pagina() {
      const contenido = conectado ? (soloMiWhatsApp
        ? "<p>WhatsApp vinculado. En el chat «Tú» escribe /sofia hola. Las demás conversaciones no se atienden.</p>"
        : "<p>WhatsApp vinculado. Envía un mensaje de prueba desde otro celular.</p>")
        : qr ? '<p>WhatsApp Business → Dispositivos vinculados → Vincular un dispositivo.</p><img width="300" alt="Código QR" src="' + await QRCode.toDataURL(qr, { width: 400 }) + '">'
        : "<p>Esperando a WhatsApp Web…</p>";
      return '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="10"><title>Vincular Sofía</title><h1>Vincular Sofía</h1>' + contenido + '</html>';
    }
  };
}

export function iniciar(dir, recibir) {
  const prueba = process.env.SOFIA_PRUEBA_NUMERO || "";
  const soloMiWhatsApp = process.env.SOFIA_SOLO_MI_WHATSAPP === "1";
  if (prueba && !/^\d{6,15}$/.test(prueba)) throw new Error("SOFIA_PRUEBA_NUMERO requiere el código de país y solo dígitos.");
  const client = new whatsapp.Client({
    authStrategy: new whatsapp.LocalAuth({ dataPath: path.join(dir, process.env.SOFIA_WA_PERFIL || "sesion-whatsapp") }),
    puppeteer: { headless: true, executablePath: rutaNavegador(), args: ["--no-sandbox", "--disable-dev-shm-usage"] },
  });
  // SOFIA_ESPERA=0 contesta al instante (para pruebas); si no, con la pausa de una persona escribiendo.
  const pausa = process.env.SOFIA_ESPERA === "0" ? () => 0 : tiempoEscribiendo;
  const dispositivo = vincular(client, recibir, prueba, soloMiWhatsApp, { pausa });
  // El supervisor del contenedor vuelve a iniciar Chromium con el mismo volumen.
  const reiniciar = () => { setTimeout(() => process.exit(1), 2000).unref(); };
  client.once("disconnected", reiniciar);
  client.once("auth_failure", reiniciar);
  const cerrar = async () => {
    const limite = setTimeout(() => process.exit(0), 5000);
    try { await client.destroy(); } finally { clearTimeout(limite); process.exit(0); }
  };
  process.once("SIGTERM", cerrar);
  process.once("SIGINT", cerrar);
  client.initialize().catch((e) => { console.error("WhatsApp Web no inició: " + (e?.message ?? e)); reiniciar(); });
  return dispositivo;
}
