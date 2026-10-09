#!/usr/bin/env node
// Servidor/conector de Sofía para Node 18+ — SIN dependencias. Sirve la app y el conector.
//
//   node prueba/servidor/servidor.mjs
//
// Configuración: variables de entorno o un archivo prueba/servidor/.env (KEY=valor por renglón):
//   PORT=8080 · SOFIA_TOKEN (si falta, se genera y se guarda en datos/clave.txt) · SOFIA_DATA_DIR
//   META_APP_SECRET · META_VERIFY_TOKEN · WA_TOKEN · WA_PHONE_NUMBER_ID · WA_WABA_ID · FB_PAGE_ID · FB_PAGE_TOKEN
// Funciona en tu computadora (con túnel HTTPS para Meta), Render, Railway, Fly, Koyeb o un VPS.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { handle, VERSION } from "./core.mjs";

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

if (!process.env.SOFIA_TOKEN) {
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
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.resolve(APP_DIR, `.${rel}`);
  // Nunca servir fuera de la app ni la carpeta del servidor (datos, claves, .env).
  if (!file.startsWith(APP_DIR + path.sep) || file.startsWith(here + path.sep)) { res.writeHead(404); res.end(); return; }
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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
    const request = new Request(url, { method: req.method, headers: req.headers, body });
    const response = await handle(request, process.env, store);
    if (!response) return serveStatic(req, res, url);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  const e = process.env;
  console.log(`\nSofía (${VERSION}) corriendo.\n  En esta computadora: http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  En la misma red Wi-Fi: http://${ip}:${PORT}`);
  console.log(`\nEn la app → Más → Conexiones → Servidor:\n  Dirección: https://<tu-dominio-o-túnel>   (o http://<IP>:${PORT} si abres la app desde aquí)\n  Clave:     ${e.SOFIA_TOKEN}`);
  console.log(`\nWhatsApp:  ${e.WA_TOKEN && e.WA_PHONE_NUMBER_ID ? "configurado" : "sin configurar"} · Facebook: ${e.FB_PAGE_ID && e.FB_PAGE_TOKEN ? "configurado" : "sin configurar"} · Webhook: ${e.META_APP_SECRET && e.META_VERIFY_TOKEN ? "listo en /webhook/meta" : "falta META_APP_SECRET / META_VERIFY_TOKEN"}`);
  console.log(`Datos en: ${DATA_DIR}\n`);
});
