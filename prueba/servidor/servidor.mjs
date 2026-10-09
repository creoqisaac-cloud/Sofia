#!/usr/bin/env node
// Servidor propio de Sofía — SIN dependencias (solo Node 18+). Sirve la app y guarda los datos.
//
//   node prueba/servidor/servidor.mjs
//
// Variables (opcionales):
//   PORT=8080            puerto
//   SOFIA_TOKEN=…        clave que la app debe enviar (si no se da, se genera una y se guarda en datos/clave.txt)
//   SOFIA_DATA_DIR=…     carpeta de datos (por defecto prueba/servidor/datos)
//
// Funciona en tu computadora, en un VPS, en Render/Railway/Fly/Koyeb o en cualquier hosting con Node.
// Protocolo (el mismo que el de Google Apps Script):
//   GET  /api/datos?token=…[&meta=1]   → { ok, updatedAt, backup }
//   POST /api/datos   (text/plain JSON { token, backup })  → { ok, updatedAt }
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(here, "..");
const DATA_DIR = path.resolve(process.env.SOFIA_DATA_DIR ?? path.join(here, "datos"));
const PORT = Number(process.env.PORT ?? 8080);
const MAX_BODY = 60 * 1024 * 1024;
const KEEP_VERSIONS = 15;

fs.mkdirSync(path.join(DATA_DIR, "versiones"), { recursive: true });
const TOKEN = (() => {
  if (process.env.SOFIA_TOKEN) return process.env.SOFIA_TOKEN;
  const f = path.join(DATA_DIR, "clave.txt");
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim();
  const t = crypto.randomBytes(12).toString("base64url");
  fs.writeFileSync(f, t, { mode: 0o600 });
  return t;
})();
const DATA_FILE = path.join(DATA_DIR, "sofia.json");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".apk": "application/vnd.android.package-archive" };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };

const sameToken = (t) => {
  const a = Buffer.from(String(t ?? ""));
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("Datos demasiado grandes")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function saveData(backup) {
  const updatedAt = new Date().toISOString();
  const doc = JSON.stringify({ updatedAt, backup });
  if (fs.existsSync(DATA_FILE)) {
    fs.copyFileSync(DATA_FILE, path.join(DATA_DIR, "versiones", `sofia-${updatedAt.replace(/[:.]/g, "-")}.json`));
    const old = fs.readdirSync(path.join(DATA_DIR, "versiones")).sort();
    for (const f of old.slice(0, Math.max(0, old.length - KEEP_VERSIONS))) fs.rmSync(path.join(DATA_DIR, "versiones", f));
  }
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, doc);
  fs.renameSync(tmp, DATA_FILE); // escritura atómica: nunca queda un archivo a medias
  return updatedAt;
}

async function api(req, res, url) {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
  if (req.method === "GET") {
    if (!sameToken(url.searchParams.get("token"))) return json(res, 401, { ok: false, error: "Clave incorrecta" });
    if (!fs.existsSync(DATA_FILE)) return json(res, 200, { ok: true, updatedAt: null, backup: null });
    const doc = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return json(res, 200, url.searchParams.get("meta") ? { ok: true, updatedAt: doc.updatedAt } : { ok: true, ...doc });
  }
  if (req.method === "POST") {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e) { return json(res, 400, { ok: false, error: e.message ?? "JSON inválido" }); }
    if (!sameToken(body.token)) return json(res, 401, { ok: false, error: "Clave incorrecta" });
    if (body.backup?.app !== "sofia-prueba") return json(res, 400, { ok: false, error: "No es un respaldo de Sofía" });
    return json(res, 200, { ok: true, updatedAt: saveData(body.backup) });
  }
  return json(res, 405, { ok: false, error: "Método no permitido" });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.resolve(APP_DIR, `.${rel}`);
  // Nunca servir fuera de la app ni la carpeta del servidor (datos y clave).
  if (!file.startsWith(APP_DIR + path.sep) || file.startsWith(here + path.sep)) { res.writeHead(404); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); res.end("No encontrado"); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/datos") return void api(req, res, url).catch((e) => json(res, 500, { ok: false, error: e.message }));
  if (url.pathname === "/api/salud") return json(res, 200, { ok: true });
  serveStatic(req, res, url);
});

server.listen(PORT, "0.0.0.0", () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  console.log(`\nSofía corriendo.\n  En esta computadora: http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  En la misma red Wi-Fi: http://${ip}:${PORT}`);
  console.log(`\nEn la app → Ajustes → Servidor propio:\n  Dirección: http://<una de las direcciones de arriba>/api/datos\n  Clave:     ${TOKEN}\n\nDatos en: ${DATA_DIR}\n`);
});
