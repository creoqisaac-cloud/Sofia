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
export function vincular(client, recibir, prueba = "", soloMiWhatsApp = false, { pausa = () => 0, operaciones = null } = {}) {
  // WhatsApp puede conservar el prefijo móvil mexicano 521 en contactos antiguos.
  const normalizar = n => String(n ?? "").replace(/^521(\d{10})$/, "52$1");
  const permitido = n => !prueba || normalizar(n) === normalizar(prueba);
  // WhatsApp identifica a muchos contactos nuevos con un LID («123@lid») en vez de su número.
  // Devuelve «número@c.us»; si no logra resolverlo, regresa el mismo LID.
  const lidResueltos = new Map();
  async function telefonoDe(jid) {
    if (!String(jid).endsWith("@lid")) return jid;
    if (lidResueltos.has(jid)) return lidResueltos.get(jid);
    const aCus = (v) => {
      const s = String(v ?? "");
      if (/^\d+@c\.us$/.test(s)) return s;
      return /^\d{6,15}$/.test(s) ? s + "@c.us" : "";
    };
    let telefono = "";
    for (let intento = 0; intento < 2 && !telefono; intento++) {
      if (intento) await new Promise((listo) => setTimeout(listo, 1500)); // WhatsApp a veces tarda en asociar el número
      const [contacto] = client.getContactLidAndPhone ? await client.getContactLidAndPhone([jid]).catch(() => []) : [];
      telefono = aCus(contacto?.pn);
    }
    if (!telefono && client.getContactById) {
      const c = await client.getContactById(jid).catch(() => null);
      telefono = aCus(c?.id?.server === "c.us" ? c.id._serialized : "") || aCus(c?.phoneNumber);
    }
    if (!telefono) return jid;
    lidResueltos.set(jid, telefono);
    if (lidResueltos.size > 2000) lidResueltos.delete(lidResueltos.keys().next().value);
    return telefono;
  }
  let qr = "";
  let conectado = false;
  let cola = Promise.resolve();
  const comandosOperativosVistos = new Set();
  // Conserva exactamente el orden que Sofía acaba de mostrar en «Tú», aunque cambie la bandeja al sincronizar.
  let pendientesMostrados = [];
  client.on("qr", codigo => { qr = codigo; conectado = false; });
  client.on("ready", () => { conectado = true; qr = ""; });
  const desconectar = () => { conectado = false; qr = ""; };
  client.on("auth_failure", desconectar);
  client.on("disconnected", desconectar);

  /** Nombre con el que el cliente se presenta en WhatsApp (o como Mario lo guardó); vacío si no hay. */
  async function nombreDe(m) {
    const aviso = String(m._data?.notifyName ?? "").trim();
    if (aviso) return aviso.slice(0, 60);
    const c = await m.getContact?.().catch(() => null);
    return String(c?.name || c?.pushname || "").trim().slice(0, 60);
  }

  /** Nota de voz de un cliente → texto (IA de Cloudflare si hay llaves); "" si no se pudo (se queda para Mario). */
  async function audioATexto(m) {
    try {
      if (!operaciones?.transcribir) return ""; // sin IA: el audio lo ve Mario en su WhatsApp
      const media = await m.downloadMedia();
      if (!media?.data || media.data.length > 7_000_000) return "";
      const texto = String((await operaciones.transcribir(media.data, media.mimetype)) ?? "").trim();
      return texto ? `🎤 ${texto.slice(0, 1000)}` : "";
    } catch (e) {
      console.warn(`No pude transcribir un audio: ${e?.message ?? e}`);
      return "";
    }
  }

  async function procesar(m) {
    if (conectado && ["ptt", "audio"].includes(m.type) && !m.fromMe && !m.isStatus && m.id?._serialized) {
      m = Object.assign(Object.create(Object.getPrototypeOf(m)), m, { type: "chat", body: await audioATexto(m) });
    }
    if (!conectado || m.type !== "chat" || !m.body || m.isStatus || !m.id?._serialized) return;
    const chat = m.fromMe ? m.to : m.from;
    if (!/^\d+@(c\.us|lid)$/.test(chat)) return;
    const propio = client.info?.wid?._serialized || (client.info?.wid?.user ? client.info.wid.user + "@c.us" : "");
    const telefono = await telefonoDe(chat);
    const numeroJid = (jid) => String(jid ?? "").match(/^(\d+)@c\.us$/)?.[1] ?? "";
    const propioUser = client.info?.wid?.user || numeroJid(propio);
    const telefonoUser = numeroJid(telefono);
    const esChatPropio = Boolean(propio) && (chat === propio || (propioUser && telefonoUser && normalizar(propioUser) === normalizar(telefonoUser)));
    if (m.fromMe && /^\/?\s*sof[ií]a\b/i.test(String(m.body).trim())) {
      console.log(`Orden de Sofía detectada en WhatsApp; chat propio: ${esChatPropio ? "sí" : "no"}.`);
    }
    if (!soloMiWhatsApp && esChatPropio && m.fromMe) {
      await procesarComandoOperativo(m, propio);
      return;
    }
    // El modo personal ignora TODO chat externo. Solo acepta comandos escritos
    // por el dueño en el chat «Tú»; nunca escucha notas ni sus propias respuestas.
    if (soloMiWhatsApp && (!esChatPropio || !m.fromMe || !/^\/sofia(?:\s|$)/i.test(m.body.trim()))) return;
    if (!soloMiWhatsApp && esChatPropio) return;
    if (!/^\d+@c\.us$/.test(telefono)) {
      // Antes se descartaba en silencio: así se perdían clientes nuevos que WhatsApp identifica por LID.
      console.warn(`Mensaje sin número de teléfono (LID …${chat.split("@")[0].slice(-4)}); no se pudo registrar.`);
      return;
    }
    const peer = telefono.split("@")[0];
    if ((!soloMiWhatsApp && peer === client.info?.wid?.user) || !permitido(peer)) return;
    const mensaje = { id: m.id._serialized, type: "text", timestamp: m.timestamp, text: { body: m.body }, ...(soloMiWhatsApp && esChatPropio ? { pruebaLocal: true } : {}) };
    const cambio = m.fromMe && !esChatPropio
      ? { field: "smb_message_echoes", value: { message_echoes: [{ ...mensaje, to: peer }] } }
      : { field: "messages", value: { contacts: [{ wa_id: peer, profile: { name: await nombreDe(m) } }], messages: [{ ...mensaje, from: peer }] } };
    await recibir({ object: "whatsapp_business_account", entry: [{ changes: [cambio] }] });
  }
  async function procesarComandoOperativo(m, propio) {
    const texto = String(m.body).trim();
    const match = texto.match(/^\/?\s*sof[ií]a(?:\s+|[,;:]\s*)(pendientes|ayuda|ayúdame|responder\s+(?:todos|\d+(?:\s*(?:,|y)\s*\d+)*)|etiquetar\s+no\s+le[ií]dos)\s*$/i);
    // Cualquier otra cosa después de «sofia» es una orden en palabras de Mario («sofia háblale a los de CR-V»).
    const libre = match ? null : texto.match(/^\/?\s*sof[ií]a(?:\s+|[,;:]\s*)([\s\S]{2,})$/i);
    if ((!match && !libre) || comandosOperativosVistos.has(m.id._serialized)) return;
    comandosOperativosVistos.add(m.id._serialized);
    if (comandosOperativosVistos.size > 200) comandosOperativosVistos.delete(comandosOperativosVistos.values().next().value);
    const responderMario = async (texto) => client.sendMessage(propio, texto, { sendSeen: false });
    try {
      if (!operaciones) throw new Error("Las órdenes de operación no están disponibles en este conector.");
      if (libre) { await ordenLibre(libre[1].trim(), responderMario); return; }
      const orden = match[1].toLowerCase();
      if (orden === "ayuda" || orden === "ayúdame") {
        await responderMario("Órdenes de Sofía (escríbelas aquí, en tu chat «Tú»):\n\n🗣️ *sofia háblale a los interesados en CR-V* — o «a los calientes diles que llegó la promo», «revive a los que no contestaron de octubre», «confírmales la cita a los de mañana», «manda foto de la HR-V a los de HR-V». Te enseño a quién y qué antes de mandar.\n✅ *sofia sí* — manda la orden que te enseñé · *sofia no* — la cancela.\n☀️ *sofia resumen* — tu día: citas, pendientes y calientes.\n📥 *sofia pendientes* — chats sin responder · *sofia responder 1,3* o *todos*.\n🏷️ *sofia etiquetar no leídos* — etiqueta Prospecto, sin mandar mensajes.");
        return;
      }
      if (/^etiquetar\s+no\s+le[ií]dos$/.test(orden)) {
        const r = await operaciones.etiquetarNoLeidos();
        if (r.error) throw new Error(r.error);
        await responderMario(!r.noLeidos
          ? "No encontré chats no leídos. No cambié etiquetas ni mandé mensajes."
          : r.noEncontrada
          ? `Revisé ${r.noLeidos} chats no leídos; no encontré la etiqueta Prospecto en WhatsApp Business. Créala en la app e inténtalo de nuevo. No mandé mensajes.`
          : `Listo: etiqueté ${r.etiquetados} de ${r.noLeidos} chats no leídos como Prospecto${r.errores ? `; ${r.errores} dieron error` : ""}${r.limite ? "; el lote se limitó a 500 chats" : ""}. No mandé mensajes.`);
        return;
      }
      if (orden === "pendientes") {
        const resultado = await operaciones.pendientes();
        const lista = resultado.pendientes ?? [];
        pendientesMostrados = lista.slice(0, 8);
        if (!lista.length) {
          await responderMario(`Listo: revisé ${resultado.chats ?? 0} chats (${resultado.mensajes ?? 0} mensajes). No encontré chats pendientes de respuesta.`);
          return;
        }
        const filas = pendientesMostrados.map((x, i) => `${i + 1}. ${x.fijado ? "📌 " : ""}${x.nombre || "Cliente"} · …${String(x.id).slice(-4)}\n   ${(x.ultimoMensaje || "").replace(/\s+/g, " ").slice(0, 110)}`);
        await responderMario(`Revisé ${resultado.chats ?? 0} chats y traje ${resultado.mensajes ?? 0} mensajes. No respondí ninguno. Los chats fijados van primero.\n\nPendientes:\n${filas.join("\n")}\n\nPara responder uno: /sofia responder 1\nVarios: /sofia responder 1,3 · Todos: /sofia responder todos`);
        return;
      }
      // Varios a la vez, solo de la lista que Mario acaba de ver: «responder todos» o «responder 1,3,5».
      const varios = /todos/.test(orden) ? pendientesMostrados.map((_, i) => i + 1) : (orden.match(/\d+/g) ?? []).map(Number);
      if (/todos/.test(orden) || varios.length > 1) {
        const numeros = [...new Set(varios)];
        if (!pendientesMostrados.length) throw new Error("Primero escribe /sofia pendientes. Solo respondo chats de esa lista.");
        if (numeros.some((n) => !Number.isInteger(n) || n < 1 || n > pendientesMostrados.length)) throw new Error(`Usa números del 1 al ${pendientesMostrados.length} de la lista de /sofia pendientes.`);
        const elegidos = numeros.map((n) => pendientesMostrados[n - 1]);
        await responderMario(`Voy a responder ${elegidos.length} chats, uno por uno:\n${elegidos.map((c) => `• ${c.nombre || "Cliente"} · …${String(c.id).slice(-4)}`).join("\n")}`);
        const fallidos = [];
        for (const c of elegidos) {
          try { await operaciones.responderPendiente(c.clave); } catch { fallidos.push(c); }
        }
        pendientesMostrados = pendientesMostrados.filter((c) => !elegidos.includes(c) || fallidos.includes(c));
        await responderMario(`Listo: Sofía respondió ${elegidos.length - fallidos.length} de ${elegidos.length}.${fallidos.length ? ` No pude con: ${fallidos.map((c) => c.nombre || "…" + String(c.id).slice(-4)).join(", ")}.` : ""} Para ver más, /sofia pendientes.`);
        return;
      }
      const numero = Number(orden.match(/\d+/)?.[0]);
      if (!Number.isInteger(numero) || numero < 1 || numero > 8) throw new Error("Elige un número del 1 al 8. Primero usa /sofia pendientes.");
      const cliente = pendientesMostrados[numero - 1];
      if (!cliente) throw new Error("Primero escribe /sofia pendientes. El número debe corresponder a esa lista.");
      await responderMario(`Voy a responder un solo chat: ${cliente.nombre || "Cliente"} · …${String(cliente.id).slice(-4)}.\nÚltimo mensaje: “${String(cliente.ultimoMensaje || "").replace(/\s+/g, " ").slice(0, 140)}”`);
      await operaciones.responderPendiente(cliente.clave);
      pendientesMostrados.splice(numero - 1, 1);
      await responderMario(`Listo. Sofía respondió a ${cliente.nombre || "ese cliente"}. Para seguir con otro, revisa /sofia pendientes.`);
    } catch (error) {
      await responderMario(`No pude completar la orden: ${error?.message ?? error}`);
    }
  }
  async function ordenLibre(orden, responderMario) {
    const o = orden.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (/^(si|simon|manda(lo|las|les)?|mandal[oa]s?|dale|confirmo|envia(lo|les)?|adelante|va)\b[\s!.]*$/.test(o)) {
      if (!operaciones.mandarOrden) throw new Error("Este conector no puede mandar órdenes.");
      await responderMario("Va, empiezo a mandar uno por uno, con unos segundos entre cada uno. Te aviso al terminar.");
      const r = await operaciones.mandarOrden(responderMario);
      await responderMario(`Listo: mandé ${r.ok} de ${r.total}.${r.fallidos.length ? ` No pude con: ${r.fallidos.join(", ")}.` : ""}`);
      return;
    }
    if (/^(no|cancela(r|la)?|olvidalo|mejor no)\b/.test(o)) {
      await responderMario(operaciones.cancelarOrden?.() ? "Cancelado: no mandé nada." : "No había ninguna orden por mandar.");
      return;
    }
    if (/^resumen\b/.test(o)) { await operaciones.resumen(); return; }
    if (!operaciones.orden) throw new Error("Este conector no entiende órdenes libres todavía.");
    const r = await operaciones.orden(orden);
    if (!r.destinatarios.length) {
      await responderMario(`Entendí: ${r.filtros.join(" · ")}. No encontré clientes con eso. Prueba con otro modelo, mes o «todos». (Escribe *sofia ayuda* para ver ejemplos.)`);
      return;
    }
    const lista = r.destinatarios.slice(0, 15).map((d) => `• ${d.nombre || `…${String(d.id).slice(-4)}`}${d.motivo ? ` (${String(d.motivo).replace(/^Honda\s+/i, "")})` : ""}`).join("\n");
    await responderMario([
      `📋 Entendí: ${r.tipo === "cita" ? "confirmar cita a" : "escribirle a"} ${r.filtros.join(" · ")} — *${r.destinatarios.length} cliente${r.destinatarios.length === 1 ? "" : "s"}*:`,
      lista + (r.destinatarios.length > 15 ? `\n…y ${r.destinatarios.length - 15} más` : ""),
      r.recortados ? `(Solo los primeros 40; los otros ${r.recortados} van en otra orden.)` : "",
      `Así le llega al primero:\n«${r.ejemplo}»`,
      r.conFoto ? "📷 Va con la foto del auto." : r.avisoFoto || "",
      "Responde *sofia sí* para mandar o *sofia no* para cancelar (tienes 15 min).",
    ].filter(Boolean).join("\n\n"));
  }
  const tipoMensaje = (m) => ({ chat: "text", ptt: "audio", vcard: "contact", multi_vcard: "contact" }[m.type] ?? m.type);
  /** todos=false: solo los que esperan respuesta. todos=true: todos los chats del último mes, para que Sofía los lea y ordene. */
  async function sincronizarPendientes({ todos = false } = {}) {
    if (!conectado) throw new Error("WhatsApp está desconectado.");
    if (soloMiWhatsApp) throw new Error("La importación de chats no está disponible en el modo de prueba personal.");
    const limiteAntiguedad = Date.now() / 1000 - 30 * 24 * 60 * 60;
    const chats = (await client.getChats()).filter((c) => !c.isGroup && c.lastMessage && (todos || !c.lastMessage.fromMe) && c.timestamp >= limiteAntiguedad && /^\d+@(c\.us|lid)$/.test(c.id?._serialized ?? ""))
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.timestamp - a.timestamp).slice(0, todos ? 400 : 100);
    const changes = [];
    let mensajes = 0;
    const fijados = [];
    for (const chat of chats) {
      try {
        const telefono = await telefonoDe(chat.id._serialized);
        if (!/^\d+@c\.us$/.test(telefono)) continue; // LID sin número: no se puede guardar ni contestar
        const peer = telefono.split("@")[0];
        if (normalizar(peer) === normalizar(client.info?.wid?.user)) continue;
        if (chat.pinned) fijados.push(peer);
        const limite = todos ? 40 : Math.min(30, Math.max(5, Number(chat.unreadCount) + 3));
        const history = (await chat.fetchMessages({ limit: limite })).sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
        const contacto = await chat.getContact().catch(() => null);
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
    return { body: { object: "whatsapp_business_account", entry: [{ changes }] }, chats: chats.length, mensajes, fijados };
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
  async function etiquetarNoLeidos() {
    if (!conectado) throw new Error("WhatsApp está desconectado.");
    if (soloMiWhatsApp) throw new Error("Esta orden no está disponible en el modo de prueba personal.");
    const chats = (await client.getChats()).filter((c) => !c.isGroup && Number(c.unreadCount) > 0 && /^\d+@(c\.us|lid)$/.test(c.id?._serialized ?? ""));
    let etiquetados = 0;
    let errores = 0;
    for (const chat of chats.slice(0, 500)) {
      try {
        const telefono = await telefonoDe(chat.id._serialized);
        if (!/^\d+@c\.us$/.test(telefono)) { errores++; continue; }
        const etiquetas = await etiquetar({ to: telefono.split("@")[0], etiquetas: ["Prospecto"] });
        if (etiquetas.some((x) => x.toLowerCase() === "prospecto")) etiquetados++;
      } catch { errores++; }
    }
    return { noLeidos: chats.length, etiquetados, noEncontrada: chats.length > 0 && etiquetados === 0 && errores === 0, errores, limite: chats.length > 500 };
  }
  // ── Etiquetas de WhatsApp Business: las que Mario ya tiene (nombre e id) y crear las que falten si WhatsApp lo permite ──
  const sinAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  async function etiquetas() {
    if (!conectado || soloMiWhatsApp) return [];
    return (await client.getLabels()).map((l) => ({ id: String(l.id), nombre: l.name }));
  }
  /** Intenta crear una etiqueta (WhatsApp Web no tiene función oficial; si no se puede, devuelve false y Mario la crea). */
  async function crearEtiqueta(nombre) {
    try {
      return Boolean(await client.pupPage.evaluate(async (n) => {
        const L = window.require("WAWebCollections").Label;
        for (const f of ["addNewLabel", "createLabel", "addLabel"]) if (typeof L?.[f] === "function") { await L[f](n); return true; }
        for (const mod of ["WAWebBizLabelAction", "WAWebLabelAction", "WAWebBizLabelActions"]) {
          try { const m = window.require(mod); for (const f of ["addNewLabel", "createLabel", "addLabel"]) if (typeof m?.[f] === "function") { await m[f](n); return true; } } catch { /* sigue */ }
        }
        return false;
      }, nombre));
    } catch { return false; }
  }
  /**
   * plan: [{ to: "52181…", etiquetas: ["Noviembre", "CR-V", …] }]. Además, a todo chat con mensajes sin leer le pone «No leído».
   * Nunca quita las etiquetas que el chat ya tenía. alias: { "no leido": ["sin leer", …] } para reconocer las de Mario.
   */
  async function etiquetarTodo({ plan = [], alias = {}, crear = true, noLeido = "No leído" } = {}) {
    if (!conectado) throw new Error("WhatsApp está desconectado.");
    if (soloMiWhatsApp) throw new Error("Las etiquetas no están disponibles en el modo de prueba personal.");
    let todas = await client.getLabels();
    const buscar = (nombre) => {
      const n = sinAcento(nombre);
      const opciones = [n, ...(alias[n] ?? []).map(sinAcento)];
      return todas.find((l) => opciones.includes(sinAcento(l.name))) ?? todas.find((l) => opciones.some((o) => o.length >= 4 && sinAcento(l.name).startsWith(o)));
    };
    // Lo que se ocupa: todas las etiquetas del plan + «No leído».
    const chats = (await client.getChats()).filter((c) => !c.isGroup && /^\d+@(c\.us|lid)$/.test(c.id?._serialized ?? ""));
    const porNumero = new Map();
    for (const p of plan) porNumero.set(normalizar(p.to), [...(porNumero.get(normalizar(p.to)) ?? []), ...p.etiquetas]);
    const sinLeer = chats.filter((c) => Number(c.unreadCount) > 0);
    const nombres = [...new Set([...plan.flatMap((p) => p.etiquetas), ...(sinLeer.length ? [noLeido] : [])])];
    const creadas = [], faltan = [];
    for (const n of nombres) {
      if (buscar(n)) continue;
      if (crear && (await crearEtiqueta(n))) { creadas.push(n); todas = await client.getLabels(); if (buscar(n)) continue; }
      faltan.push(n);
    }
    let etiquetados = 0, errores = 0;
    const conteo = {};
    for (const chat of chats) {
      try {
        const telefono = await telefonoDe(chat.id._serialized);
        const numero = /^\d+@c\.us$/.test(telefono) ? normalizar(telefono.split("@")[0]) : "";
        const quiere = [...(porNumero.get(numero) ?? []), ...(Number(chat.unreadCount) > 0 ? [noLeido] : [])];
        const ids = [...new Set(quiere.map(buscar).filter(Boolean).map((l) => String(l.id)))];
        if (!ids.length) continue;
        const actuales = (await chat.getLabels().catch(() => [])).map((l) => String(l.id));
        const nuevas = ids.filter((id) => !actuales.includes(id));
        if (!nuevas.length) continue;
        await chat.changeLabels([...actuales, ...nuevas]);
        etiquetados++;
        for (const id of nuevas) { const nom = todas.find((l) => String(l.id) === id)?.name ?? id; conteo[nom] = (conteo[nom] ?? 0) + 1; }
      } catch { errores++; }
    }
    return { chats: chats.length, etiquetados, conteo, creadas, faltan, errores, sinLeer: sinLeer.length };
  }
  client.on("message_create", m => {
    cola = cola.then(() => procesar(m)).catch(() => console.error("No se pudo procesar un mensaje del dispositivo vinculado."));
  });
  return {
    sincronizarPendientes,
    etiquetar,
    etiquetarNoLeidos,
    etiquetas,
    etiquetarTodo,
    estado: () => ({ configured: true, ok: conectado, phone: conectado ? client.info?.wid?.user : null, modo: soloMiWhatsApp ? "solo-mi-whatsapp" : "web" }),
    async enviar({ to, text, image, media }) {
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
      const adjunto = media?.mime && media?.datos ? new whatsapp.MessageMedia(media.mime, media.datos, "vehiculo.jpg") : null;
      const msg = adjunto
        ? await client.sendMessage(destino._serialized, adjunto, { caption: texto, sendSeen: false })
        : await client.sendMessage(destino._serialized, texto, { sendSeen: false });
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

export function iniciar(dir, recibir, operaciones = null) {
  const prueba = process.env.SOFIA_PRUEBA_NUMERO || "";
  const soloMiWhatsApp = process.env.SOFIA_SOLO_MI_WHATSAPP === "1";
  if (prueba && !/^\d{6,15}$/.test(prueba)) throw new Error("SOFIA_PRUEBA_NUMERO requiere el código de país y solo dígitos.");
  const client = new whatsapp.Client({
    authStrategy: new whatsapp.LocalAuth({ dataPath: path.join(dir, process.env.SOFIA_WA_PERFIL || "sesion-whatsapp") }),
    puppeteer: { headless: true, executablePath: rutaNavegador(), args: ["--no-sandbox", "--disable-dev-shm-usage"] },
  });
  // SOFIA_ESPERA=0 contesta al instante (para pruebas); si no, con la pausa de una persona escribiendo.
  const pausa = process.env.SOFIA_ESPERA === "0" ? () => 0 : tiempoEscribiendo;
  const dispositivo = vincular(client, recibir, prueba, soloMiWhatsApp, { pausa, operaciones });
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
