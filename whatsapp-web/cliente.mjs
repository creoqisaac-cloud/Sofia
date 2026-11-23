import path from "node:path";
import QRCode from "qrcode";
import whatsapp from "whatsapp-web.js";

export function vincular(client, recibir, prueba = "", soloMiWhatsApp = false) {
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
  client.on("message_create", m => {
    cola = cola.then(() => procesar(m)).catch(() => console.error("No se pudo procesar un mensaje del dispositivo vinculado."));
  });
  return {
    estado: () => ({ configured: true, ok: conectado, phone: conectado ? client.info?.wid?.user : null, modo: soloMiWhatsApp ? "solo-mi-whatsapp" : "web" }),
    async enviar({ to, text, image }) {
      if (!conectado) throw new Error("El dispositivo de WhatsApp está desconectado.");
      const self = client.info?.wid?.user;
      if (!/^\d{6,15}$/.test(to) || !permitido(to) || (soloMiWhatsApp && normalizar(to) !== normalizar(self))) throw new Error("Destinatario no habilitado.");
      const destino = await client.getNumberId(to);
      if (!destino) throw new Error("WhatsApp no encontró el contacto.");
      const msg = await client.sendMessage(destino._serialized, [text, image].filter(Boolean).join("\n"), { sendSeen: false });
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
    authStrategy: new whatsapp.LocalAuth({ dataPath: path.join(dir, "sesion-whatsapp") }),
    puppeteer: { headless: true, executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] },
  });
  const dispositivo = vincular(client, recibir, prueba, soloMiWhatsApp);
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
  client.initialize().catch(() => { console.error("WhatsApp Web no inició."); reiniciar(); });
  return dispositivo;
}
