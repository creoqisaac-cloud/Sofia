// Prueba del conector en el motor REAL de Cloudflare Workers (workerd, con `wrangler dev --local`):
// el mismo archivo que se pega en el editor de Cloudflare (prueba/servidor/cloudflare/worker-un-archivo.js),
// con KV y cron. El servidor arranca SOLO con SOFIA_TOKEN; los datos de Meta y de la IA se guardan como lo
// hace la app (POST /api/conexion). Lo único simulado son las API de Meta y Anthropic (sin cuentas reales).
//   node scripts/prueba-cloudflare.mjs
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER = "wrangler@4.40.0";
const PUERTO = 8788;
const W = `http://127.0.0.1:${PUERTO}`;
const SECRETO = crypto.randomBytes(16).toString("hex"); // clave secreta de la app de Meta (inventada)
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "sofia-cf-"));
let fallas = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) fallas++; };

// ───────── Meta y Anthropic simulados ─────────
const llamadas = [];
let n = 0;
const falso = http.createServer((req, res) => {
  const partes = [];
  req.on("data", (c) => partes.push(c));
  req.on("end", () => {
    const body = Buffer.concat(partes).toString("utf8");
    llamadas.push({ path: req.url, auth: req.headers.authorization ?? req.headers["x-api-key"], body });
    const send = (o, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    const p = req.url;
    if (p.startsWith("/v1/messages")) {
      const b = JSON.parse(body);
      return send({ id: "msg_1", type: "message", role: "assistant", model: b.model, content: [{ type: "text", text: JSON.stringify({ respuesta: "Sí recibimos tu auto a cuenta; el asesor te hace el avalúo. ¿Cuándo lo traes?", pasar_a_asesor: true, auto_id: "" }) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } });
    }
    if (req.headers.authorization !== "Bearer EAAGprueba0000000000000000" && req.headers.authorization !== "Bearer EAAGpagina0000000000000000") return send({ error: { message: "Invalid OAuth access token" } }, 401);
    if (p === "/v/11111/messages") { const to = String(JSON.parse(body).to); return send({ messaging_product: "whatsapp", contacts: [{ input: to, wa_id: to }], messages: [{ id: `wamid.OUT${++n}` }] }); }
    if (p.startsWith("/v/11111?fields")) return send({ display_phone_number: "+52 81 0000 0000", verified_name: "Agencia Prueba" });
    if (p.startsWith("/v/33333?fields")) return send({ name: "Página Prueba", link: "https://facebook.com/prueba" });
    if (p === "/v/33333/feed") return send({ id: "33333_100" });
    send({ error: { message: `ruta simulada desconocida ${p}` } }, 404);
  });
});
await new Promise((r) => falso.listen(0, "127.0.0.1", r));
const FALSO = `http://127.0.0.1:${falso.address().port}`;

// ───────── Worker en workerd ─────────
fs.copyFileSync(path.join(raiz, "prueba/servidor/cloudflare/worker-un-archivo.js"), path.join(TMP, "worker.js"));
fs.writeFileSync(path.join(TMP, "wrangler.toml"), `name = "sofia-prueba"
main = "worker.js"
compatibility_date = "2025-09-01"
[[kv_namespaces]]
binding = "SOFIA_KV"
id = "local"
[triggers]
crons = ["*/5 * * * *"]
[vars]
SOFIA_TOKEN = "clave-prueba"
META_GRAPH_URL = "${FALSO}/v"
ANTHROPIC_BASE_URL = "${FALSO}"
`);
const wr = spawn("npx", ["--yes", WRANGLER, "dev", "--local", "--ip", "127.0.0.1", "--port", String(PUERTO), "--test-scheduled"], { cwd: TMP, detached: true, stdio: ["ignore", "pipe", "pipe"] });
let salida = "";
wr.stdout.on("data", (d) => { salida += d; });
wr.stderr.on("data", (d) => { salida += d; });
const terminar = () => { try { process.kill(-wr.pid, "SIGTERM"); } catch { /* ya terminó */ } falso.close(); };
process.on("exit", terminar);

let listo = false;
for (let i = 0; i < 180 && !listo; i++) {
  try { listo = (await fetch(`${W}/api/salud`)).ok; } catch { await new Promise((r) => setTimeout(r, 1000)); }
}
if (!listo) { console.error(salida.slice(-3000)); terminar(); throw new Error("wrangler dev no arrancó"); }
console.log(`Conector corriendo en workerd (${WRANGLER}).`);

const post = (p, b) => fetch(W + p, { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ token: "clave-prueba", ...b }) }).then((r) => r.json());
const firmado = (cuerpo) => {
  const raw = JSON.stringify(cuerpo);
  return fetch(`${W}/webhook/meta`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${crypto.createHmac("sha256", SECRETO).update(raw).digest("hex")}` }, body: raw });
};
const mensaje = (from, id, text, name = "Lucía Prueba") => firmado({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { contacts: [{ wa_id: from, profile: { name } }], messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }] } }] }] });
const enviados = (desde) => llamadas.slice(desde).filter((c) => c.path === "/v/11111/messages").map((c) => JSON.parse(c.body));

try {
  // 1. La app guarda los datos de Meta y de la IA en el servidor (nada en las variables de Cloudflare)
  const con = await post("/api/conexion", { datos: { WA_TOKEN: "EAAGprueba0000000000000000", WA_PHONE_NUMBER_ID: "11111", WA_WABA_ID: "22222", META_APP_SECRET: SECRETO, FB_PAGE_ID: "33333", FB_PAGE_TOKEN: "EAAGpagina0000000000000000", PUBLIC_URL: "https://sofia-prueba.ejemplo.workers.dev", ANTHROPIC_API_KEY: "sk-ant-prueba-0000000000" } });
  ok(con.ok && con.configurado.WA_TOKEN === "app" && !JSON.stringify(con).includes("EAAGprueba"), "datos de Meta guardados desde la app (los secretos no regresan)");
  const st = await (await fetch(`${W}/api/estado?token=clave-prueba`)).json();
  ok(st.whatsapp.ok && st.whatsapp.phone === "+52 81 0000 0000" && st.facebook.ok, "el conector valida el token con Meta: WhatsApp ✓ y página ✓");
  const reto = await (await fetch(`${W}/webhook/meta?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(con.webhook.verifyToken)}&hub.challenge=42`)).text();
  ok(reto === "42" && con.webhook.url === "https://sofia-prueba.ejemplo.workers.dev/webhook/meta", "Meta puede verificar el webhook con la URL y el token que muestra la app");
  ok((await fetch(`${W}/webhook/meta`, { method: "POST", headers: { "x-hub-signature-256": "sha256=00" }, body: "{}" })).status === 401, "avisos sin la firma de Meta se rechazan");

  // 2. Vendedora con inventario y foto
  // Primero sin IA (el menú); luego con IA, que lleva toda la plática.
  await post("/api/agente/config", { config: { activo: true, asesor: "Pedro", agencia: "Autos Ejemplo", horario: { dias: [0, 1, 2, 3, 4, 5, 6], inicio: "00:00", fin: "00:00" }, ventas: { activo: true, ia: false } } });
  const jpg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 0xff, 0xd9]).toString("base64")}`;
  const { fotoId } = await post("/api/inventario/foto", { imagen: jpg });
  await post("/api/inventario", { autos: [{ id: "crv", marca: "Honda", modelo: "CR-V", version: "Touring", anio: 2026, precio: 689900, tipo: "nuevo", fotoId }, { id: "versa", marca: "Nissan", modelo: "Versa", anio: 2022, precio: 269000, tipo: "seminuevo", km: 41000 }] });
  const foto = await fetch(`${W}/media/${fotoId}`);
  ok(foto.status === 200 && foto.headers.get("content-type") === "image/jpeg", "la foto del auto se sirve en público (WhatsApp la descarga de ahí)");

  // 3. Conversación por el webhook
  let k = llamadas.length;
  await mensaje("5218122222222", "wamid.1", "Hola, ¿cuánto cuesta la crv?");
  let e = enviados(k);
  ok(e[0]?.type === "image" && e[0].image.link === `https://sofia-prueba.ejemplo.workers.dev/media/${fotoId}` && e[0].image.caption.includes("$689,900"), "contesta con la foto y el precio de la CR-V");
  k = llamadas.length;
  for (const [id, t] of [["wamid.2", "1"], ["wamid.3", "20%"], ["wamid.3", "20%"], ["wamid.4", "1"], ["wamid.5", "el sábado a las 11"]]) await mensaje("5218122222222", id, t);
  e = enviados(k).map((m) => m.text?.body ?? "");
  ok(e.length === 4 && e[1].includes("60 meses") && e[3].includes("Anoté tu visita: *el sábado a las 11*"), "recuerda la conversación (enganche → cotización → cita) y no contesta dos veces un reenvío de Meta");
  const leads = (await (await fetch(`${W}/api/prospectos?token=clave-prueba`)).json()).prospectos;
  ok(leads[0]?.cita === "el sábado a las 11" && leads[0].formaPago === "credito" && leads[0].enganche === 137980, "prospecto con auto, crédito, enganche y cita");

  // 4. Con IA (SDK de Anthropic dentro del Worker): Sofía platica como vendedora
  await post("/api/agente/config", { config: { ventas: { ia: true } } });
  k = llamadas.length;
  await mensaje("5218133333333", "wamid.6", "Hola", "Luis");
  await mensaje("5218133333333", "wamid.7", "¿aceptan mi carro a cuenta?", "Luis");
  const ia = llamadas.slice(k).find((c) => c.path.startsWith("/v1/messages"));
  ok(ia?.auth === "sk-ant-prueba-0000000000" && JSON.parse(ia.body).system.includes("Honda CR-V Touring 2026"), "llama a Claude con la llave guardada desde la app y el inventario");
  ok(enviados(k).some((m) => m.text?.body.includes("avalúo")), "manda la respuesta de la IA por WhatsApp");

  // 5. Cron de Cloudflare: publica lo programado aunque la app esté cerrada
  const prog = await post("/api/social/programar", { post: { texto: "Prueba del programador", cuando: new Date(Date.now() + 1500).toISOString(), canales: ["facebook"] } });
  await new Promise((r) => setTimeout(r, 2500));
  k = llamadas.length;
  await fetch(`${W}/__scheduled?cron=*/5+*+*+*+*`);
  await new Promise((r) => setTimeout(r, 2000));
  ok(prog.item?.estado === "pendiente" && llamadas.slice(k).some((c) => c.path === "/v/33333/feed"), "el cron de Cloudflare publica lo programado");
} finally {
  terminar();
}
if (fallas) { console.error(salida.slice(-3000)); process.exit(1); }
console.log("OK: el conector funciona en el motor real de Cloudflare.");
process.exit(0);
