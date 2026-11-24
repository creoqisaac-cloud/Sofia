#!/usr/bin/env node
// Servidor/conector de Sofía para Node 18+ — SIN dependencias. Sirve la app y el conector.
//
//   node prueba/servidor/servidor.mjs
//
// Configuración: variables de entorno o un archivo prueba/servidor/.env (KEY=valor por renglón):
//   PORT=8080 · SOFIA_TOKEN (si falta, se genera y se guarda en datos/clave.txt) · SOFIA_DATA_DIR
//   META_APP_SECRET · META_VERIFY_TOKEN · WA_TOKEN · WA_PHONE_NUMBER_ID · WA_WABA_ID · FB_PAGE_ID · FB_PAGE_TOKEN
//   IG_USER_ID (Instagram) · PUBLIC_URL (dirección HTTPS pública: Instagram descarga de ahí las fotos programadas)
// Funciona en tu computadora (con túnel HTTPS para Meta), Render, Railway, Fly, Koyeb o un VPS.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { handle, runScheduled, eventoVinculado, VERSION } from "./core.mjs";
import { iaPorApi } from "./ia-cloudflare.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(here, "..");

// .env opcional (sin dependencias)
const envFile = path.join(here, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const DATA_DIR = path.resolve(process.env.SOFIA_DATA_DIR ?? path.join(here, "datos"));
const PORT = Number(process.env.PORT ?? 8080);
const MAX_BODY = 60 * 1024 * 1024;
fs.mkdirSync(path.join(DATA_DIR, "kv"), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "versiones"), { recursive: true });

let claveGenerada = false; // solo así se imprime la clave: en un hosting quedaría en los registros
if (!process.env.SOFIA_TOKEN) {
  if (process.env.SOFIA_WHATSAPP_WEB === "1") throw new Error("Define SOFIA_TOKEN para proteger la vinculación por QR.");
  claveGenerada = true;
  const f = path.join(DATA_DIR, "clave.txt");
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(12).toString("base64url"), { mode: 0o600 });
  process.env.SOFIA_TOKEN = fs.readFileSync(f, "utf8").trim();
}

// Almacén en archivos JSON (escritura atómica). Las versiones anteriores de los datos se conservan.
const fileOf = (key) => path.join(DATA_DIR, "kv", `${key.replace(/[^\w.-]+/g, "_")}.json`);
const store = {
  async get(key) {
    try { return JSON.parse(fs.readFileSync(fileOf(key), "utf8")); } catch { return null; }
  },
  async put(key, value) {
    const f = fileOf(key);
    if (key === "datos:main" && fs.existsSync(f)) {
      const dir = path.join(DATA_DIR, "versiones");
      fs.copyFileSync(f, path.join(dir, `datos-${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
      const old = fs.readdirSync(dir).sort();
      for (const x of old.slice(0, Math.max(0, old.length - 15))) fs.rmSync(path.join(dir, x));
    }
    fs.writeFileSync(`${f}.tmp`, JSON.stringify(value));
    fs.renameSync(`${f}.tmp`, f);
  },
};

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".gz": "application/gzip", ".apk": "application/vnd.android.package-archive" };

function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.resolve(APP_DIR, `.${rel}`);
  // Nunca servir fuera de la app ni la carpeta del servidor (datos, claves, .env). Sin distinguir mayúsculas
  // (en Mac y Windows "/Servidor/.env" es el mismo archivo) y sin partes ocultas o que terminen en punto/espacio
  // (Windows ignora "servidor." → "servidor").
  const lc = (x) => x.toLowerCase();
  const partes = rel.split(/[/\\]/).filter(Boolean);
  if (!file.startsWith(APP_DIR + path.sep) || lc(file).startsWith(lc(here + path.sep)) || partes.some((x) => x.startsWith(".") || /[.\s]$/.test(x))) {
    res.writeHead(404); res.end(); return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); res.end("No encontrado"); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error("Datos demasiado grandes")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const entorno = { ...process.env };
// Llaves de IA en archivos junto a los datos (fuera de Git); cada línea sin «#» es un valor, en este orden:
//   cloudflare.txt → Account ID · API token        ia-local.txt → URL · modelo · llave (opcional)
const lineasDe = (nombre) => {
  try { return fs.readFileSync(path.join(path.dirname(DATA_DIR), nombre), "utf8").split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith("#")); }
  catch { return []; }
};
const [cfCuenta, cfLlave] = lineasDe("cloudflare.txt");
if (cfCuenta && cfLlave && !entorno.CF_API_TOKEN) Object.assign(entorno, { CF_ACCOUNT_ID: cfCuenta, CF_API_TOKEN: cfLlave });
const [localUrl, localModelo, localLlave] = lineasDe("ia-local.txt");
if (localUrl && !entorno.LOCAL_AI_URL) Object.assign(entorno, { LOCAL_AI_URL: localUrl, ...(localModelo ? { LOCAL_AI_MODEL: localModelo } : {}), ...(localLlave ? { LOCAL_AI_KEY: localLlave } : {}) });
// IA gratis de Cloudflare por su API (en el Worker se usa el enlace «AI»): Sofía platica natural en vez de por reglas.
const iaGratis = iaPorApi({ cuenta: entorno.CF_ACCOUNT_ID, llave: entorno.CF_API_TOKEN, url: entorno.CF_API_URL });
if (iaGratis) entorno.AI = iaGratis;
if (entorno.SOFIA_WHATSAPP_WEB === "1") {
  const { iniciar } = await import("../../whatsapp-web/cliente.mjs");
  const operacionInterna = async (ruta, datos = {}) => {
    const req = new Request(`http://localhost${ruta}`, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...datos, token: entorno.SOFIA_TOKEN }),
    });
    const res = await handle(req, entorno, store);
    const resultado = await res.json();
    if (!res.ok || resultado.ok === false) throw new Error(resultado.error || `Error ${res.status}`);
    return resultado;
  };
  const operaciones = {
    async pendientes() {
      const resumen = await operacionInterna("/api/buzon/sincronizar");
      const index = (await store.get("inbox:index")) ?? {};
      const limite = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const pendientes = Object.entries(index)
        .filter(([clave, c]) => clave.startsWith("wa:") && c.lastDir === "in" && Date.parse(c.lastAt) >= limite)
        .map(([clave, c]) => ({ clave, id: c.id, nombre: c.name, ultimoMensaje: c.lastText, at: c.lastAt, fijado: (resumen.fijados ?? []).includes(String(c.id)) }))
        .sort((a, b) => Number(b.fijado) - Number(a.fijado) || String(b.at).localeCompare(String(a.at)));
      return { ...resumen, pendientes };
    },
    async responderPendiente(clave) {
      return operacionInterna("/api/buzon/responder", { clave });
    },
    async etiquetarNoLeidos() {
      return operacionInterna("/api/whatsapp/etiquetar-no-leidos");
    },
    // «sofia háblale a los interesados en CR-V»: primero enseña a quién y qué; solo manda con «sofia sí».
    async orden(texto) {
      const { interpretarOrden, mensajePara } = await import("../js/ordenes.js");
      const leads = (await store.get("leads:index")) ?? {};
      const prospectos = Object.entries(leads).map(([clave, l]) => ({ clave, ...l }));
      const r = interpretarOrden(texto, { prospectos, bandeja: (await store.get("inbox:index")) ?? {}, citas: (await store.get("agenda:citas")) ?? [], inventario: (await store.get("ventas:inventario")) ?? [] });
      const inventario = (await store.get("ventas:inventario")) ?? [];
      const foto = r.foto ? inventario.find((a) => a.fotoId && String(a.modelo).toUpperCase().replace(/[^A-Z]/g, "") === r.foto.toUpperCase().replace(/[^A-Z]/g, "")) : null;
      const destinatarios = r.destinatarios.slice(0, 40); // tope por orden: protege el número de Mario
      ordenPendiente = destinatarios.length ? { destinatarios, plantilla: r.mensaje, fotoId: foto?.fotoId, vence: Date.now() + 15 * 60e3 } : null;
      return { ...r, destinatarios, recortados: r.destinatarios.length - destinatarios.length, ejemplo: destinatarios[0] ? mensajePara(r.mensaje, destinatarios[0]) : "", conFoto: Boolean(foto) };
    },
    async mandarOrden(avance) {
      const o = ordenPendiente;
      ordenPendiente = null;
      if (!o || Date.now() > o.vence) throw new Error("No hay una orden por confirmar (o ya pasaron 15 minutos). Vuelve a escribirla.");
      const { mensajePara } = await import("../js/ordenes.js");
      let ok = 0;
      const fallidos = [];
      for (const [i, d] of o.destinatarios.entries()) {
        try { await operacionInterna("/api/enviar", { channel: "wa", to: d.id, text: mensajePara(o.plantilla, d), ...(o.fotoId ? { imageId: o.fotoId } : {}) }); ok++; }
        catch { fallidos.push(d.nombre || `…${String(d.id).slice(-4)}`); }
        if (i < o.destinatarios.length - 1) {
          if ((i + 1) % 10 === 0) await avance?.(`Llevo ${i + 1} de ${o.destinatarios.length}…`);
          await new Promise((r) => setTimeout(r, 8000 + Math.random() * 7000)); // ritmo de persona
        }
      }
      return { ok, total: o.destinatarios.length, fallidos };
    },
    // Modo Jarvis: recordatorios, notas, preguntas y «apágate/préndete». Lo mismo que «Dile a Sofía» en la app.
    async jarvis(texto) { return operacionInterna("/api/jarvis", { texto }); },
    cancelarOrden() { const habia = Boolean(ordenPendiente); ordenPendiente = null; return habia; },
    async resumen() { return operacionInterna("/api/resumen/enviar"); },
    // Nota de voz → texto con Whisper de Cloudflare (gratis), con las llaves del archivo o las guardadas en ⚙.
    // Sin llaves devuelve "" y el audio se queda para Mario.
    async transcribir(base64) {
      const d = (await store.get("conexion:meta")) ?? {};
      const ai = entorno.AI?.run ? entorno.AI : iaPorApi({ cuenta: d.CF_ACCOUNT_ID || entorno.CF_ACCOUNT_ID, llave: d.CF_API_TOKEN || entorno.CF_API_TOKEN });
      if (!ai) return "";
      try {
        const r = await ai.run("@cf/openai/whisper-large-v3-turbo", { audio: base64, language: "es" });
        return r?.text ?? "";
      } catch {
        const r = await ai.run("@cf/openai/whisper", { audio: [...Buffer.from(base64, "base64")] });
        return r?.text ?? "";
      }
    },
  };
  let ordenPendiente = null;
  entorno.WA_WEB = iniciar(DATA_DIR, evento => eventoVinculado(evento, entorno, store), operaciones);
  // Con IA conectada, Sofía lee TODOS los chats del último mes (sin contestar nada) para que la IA de fondo los
  // ordene: cliente, postventa o personal, con su resumen. Al arrancar y cada 6 horas.
  const importarTodo = async () => {
    try {
      if (!entorno.WA_WEB?.estado?.().ok) return;
      const d = (await store.get("conexion:meta")) ?? {};
      if (!(entorno.LOCAL_AI_URL || d.LOCAL_AI_URL || iaGratis || d.CF_API_TOKEN)) return;
      const r = await operacionInterna("/api/buzon/sincronizar", { todos: true });
      console.log(`Sofía leyó ${r.chats} chats (${r.mensajes} mensajes) para ordenarlos.`);
    } catch (e) { console.warn(`Importar chats: ${e.message}`); }
  };
  setTimeout(importarTodo, 3 * 60_000).unref();
  setInterval(importarTodo, 6 * 60 * 60_000).unref();
}

// Puente al celular: Sofia.ps1 abre un túnel de Cloudflare hacia este servidor y deja su registro en
// SOFIA_TUNEL_LOG. Al ver una dirección nueva, Sofía la usa como dirección pública (fotos) y le manda
// a Mario, a su chat «Tú», un link de un toque que conecta la app. Solo una vez por dirección.
if (entorno.SOFIA_TUNEL_LOG && entorno.WA_WEB) {
  const app = (entorno.SOFIA_APP_URL || "https://creoqisaac-cloud.github.io/Sofia/").replace(/\/?$/, "/");
  let avisando = false;
  setInterval(async () => {
    if (avisando) return;
    avisando = true;
    try {
      const log = fs.existsSync(entorno.SOFIA_TUNEL_LOG) ? fs.readFileSync(entorno.SOFIA_TUNEL_LOG, "utf8") : "";
      const direccion = [...log.matchAll(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g)].at(-1)?.[0];
      if (!direccion) return;
      entorno.PUBLIC_URL = direccion;
      const wa = entorno.WA_WEB.estado();
      if (!wa.ok || !wa.phone || (await store.get("tunel:avisado")) === direccion) return;
      const link = `${app}#/conectar?u=${encodeURIComponent(direccion)}&k=${encodeURIComponent(entorno.SOFIA_TOKEN)}`;
      await entorno.WA_WEB.enviar({ to: String(wa.phone), text: `📲 Sofía lista en tu celular. Toca para abrir la app ya conectada:\n${link}\n\nNo compartas este link: lleva tu clave. Si la computadora se reinicia te mando uno nuevo.` });
      await store.put("tunel:avisado", direccion);
      console.log("Túnel listo; link de conexión enviado al chat «Tú».");
    } catch (e) {
      console.error("Túnel:", e.message);
    } finally {
      avisando = false;
    }
  }, 5000).unref();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/vincular" && entorno.WA_WEB) {
      const permiso = Buffer.from("Basic " + Buffer.from("sofia:" + entorno.SOFIA_TOKEN).toString("base64"));
      const enviado = Buffer.from(req.headers.authorization || "");
      res.setHeader("Cache-Control", "no-store");
      if (enviado.length !== permiso.length || !crypto.timingSafeEqual(enviado, permiso)) {
        res.writeHead(401, { "www-authenticate": 'Basic realm="Sofia"' }); res.end(); return;
      }
      const pagina = await entorno.WA_WEB.pagina();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'; img-src data:; frame-ancestors 'none'" });
      res.end(pagina); return;
    }
    const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
    const request = new Request(url, { method: req.method, headers: req.headers, body });
    const response = await handle(request, entorno, store);
    if (!response) return serveStatic(req, res, url);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
});

// Programador de publicaciones: cada minuto publica en Facebook/Instagram lo que ya tocaba, aunque la app
// esté cerrada. Para Instagram define PUBLIC_URL (la dirección HTTPS pública de este servidor o del túnel).
let programando = false;
setInterval(async () => {
  if (programando) return; // la corrida anterior sigue publicando
  programando = true;
  try {
    const r = await runScheduled(entorno, store);
    if (r.publicadas || r.fallidas) console.log(`Programador: ${r.publicadas} publicada(s), ${r.fallidas} con error.`);
  } catch (e) {
    console.error("Programador:", e.message);
  } finally {
    programando = false;
  }
}, 60_000);

server.listen(PORT, process.env.SOFIA_BIND || "0.0.0.0", () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  const e = process.env;
  console.log(`\nSofía (${VERSION}) corriendo.\n  En esta computadora: http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  En la misma red Wi-Fi: http://${ip}:${PORT}`);
  console.log(`\nEn la app → Más → Conexiones → Servidor:\n  Dirección: https://<tu-dominio-o-túnel>   (o http://<IP>:${PORT} si abres la app desde aquí)\n  Clave:     ${claveGenerada ? e.SOFIA_TOKEN : `(la de SOFIA_TOKEN, termina en …${e.SOFIA_TOKEN.slice(-4)})`}`);
  console.log(`\nWhatsApp:  ${e.WA_TOKEN && e.WA_PHONE_NUMBER_ID ? "configurado" : "sin configurar"} · Facebook: ${e.FB_PAGE_ID && e.FB_PAGE_TOKEN ? "configurado" : "sin configurar"} · Webhook: ${e.META_APP_SECRET && e.META_VERIFY_TOKEN ? "listo en /webhook/meta" : "falta META_APP_SECRET / META_VERIFY_TOKEN"}`);
  const motores = [iaGratis && "Cloudflare", entorno.LOCAL_AI_URL && `local (${entorno.LOCAL_AI_MODEL || "qwen2.5:7b"})`, e.ANTHROPIC_API_KEY && "Claude"].filter(Boolean);
  console.log(`IA:        ${motores.length ? `reglas primero; si no entienden → ${motores.join(" → ")}` : "sin IA (contesta con reglas)"}`);
  console.log(`Datos en: ${DATA_DIR}\n`);
});
