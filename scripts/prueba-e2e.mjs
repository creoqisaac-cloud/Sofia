// Prueba de punta a punta de la app (prueba/) en un Chromium real con tamaño de celular.
// Simula SOLO lo externo: la API de Anthropic (IA) y la Graph API de Meta (WhatsApp/Facebook).
// Requiere el servidor apuntando a la Graph API simulada de este script (puerto 9099):
//   SOFIA_TOKEN=clave-prueba META_APP_SECRET=secreto-app META_VERIFY_TOKEN=verifica WA_TOKEN=tok-wa \
//   WA_PHONE_NUMBER_ID=111 WA_WABA_ID=222 FB_PAGE_ID=333 FB_PAGE_TOKEN=tok-fb META_GRAPH_URL=http://127.0.0.1:9099/v \
//   node prueba/servidor/servidor.mjs
//   BASE=http://localhost:8080/ node scripts/prueba-e2e.mjs      (SHOTS=carpeta para capturas)
// Solo datos SINTÉTICOS (persona inexistente con CURP de estructura válida).
import { chromium, devices } from "playwright";
import { PDFDocument, StandardFonts, PDFCheckBox } from "pdf-lib";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { curpCheckDigit } from "../prueba/js/mxid.js";
import { BBVA_ADAPTER } from "../prueba/js/bank-adapters.js";

const BASE = process.env.BASE ?? "http://localhost:8080/";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "sofia-e2e-"));
const shots = process.env.SHOTS ?? path.join(TMP, "shots");
fs.mkdirSync(shots, { recursive: true });
const CURP = "SIEP850505MDFNJR0" + curpCheckDigit("SIEP850505MDFNJR0");
const INE_TEXT = ["INSTITUTO NACIONAL ELECTORAL", "CREDENCIAL PARA VOTAR", "NOMBRE", "SINTETICO", "EJEMPLO", "PRUEBA ANA", "SEXO M", "DOMICILIO", "C FALSA 123 INT 4", "COL CENTRO 06000", "CUAUHTEMOC, CDMX.", "CLAVE DE ELECTOR SNEJPR85050509M100", `CURP ${CURP}`, "FECHA DE NACIMIENTO", "05/05/1985", "SECCION 0001 VIGENCIA 2023 - 2033"].join("\n");
const ICON = new URL("../prueba/icon-192.png", import.meta.url);
const step = (t) => console.log("•", t);
const errors = [];

// ───────── Graph API de Meta simulada ─────────
const graphCalls = [];
const fakeMeta = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    graphCalls.push({ method: req.method, path: req.url, body });
    const send = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    const p = req.url;
    if (p.startsWith("/v/111?fields")) return send({ display_phone_number: "+52 81 0000 0000", verified_name: "Agencia Prueba" });
    if (p === "/v/111/messages") return send({ messages: [{ id: `wamid.OUT${graphCalls.length}` }] });
    if (p.startsWith("/v/222/message_templates")) return send({ data: [{ name: "hello_world", status: "APPROVED", language: "en_US", components: [{ type: "BODY", text: "Hello World" }] }] });
    if (p === "/v/555") return send({ url: "http://127.0.0.1:9099/archivo/555", mime_type: "image/png" });
    if (p === "/archivo/555") { res.writeHead(200, { "content-type": "image/png" }); return res.end(fs.readFileSync(path.join(TMP, "ine-sintetica.png"))); }
    if (p.startsWith("/v/333?fields")) return send({ name: "Página Prueba", link: "https://facebook.com/prueba" });
    if (p === "/v/333/photos") return send({ id: "ph1", post_id: "333_99" });
    if (p === "/v/333/feed") return send({ id: "333_100" });
    res.writeHead(404); res.end("{}");
  });
});
await new Promise((r) => fakeMeta.listen(9099, "127.0.0.1", r));

function webhook(payload) {
  const raw = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", "secreto-app").update(raw).digest("hex");
  return fetch(new URL("webhook/meta", BASE), { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${sig}` }, body: raw });
}
const waIn = (id, msg) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { contacts: [{ wa_id: "5218199998888", profile: { name: "Lupita Prospecto" } }], messages: [{ from: "5218199998888", id, timestamp: String(Math.floor(Date.now() / 1000)), ...msg }] } }] }] });

// ───────── API de Anthropic simulada (respuestas según el esquema pedido) ─────────
const aiCalls = [];
function aiAnswer(body) {
  const props = body.output_config?.format?.schema?.properties ?? {};
  aiCalls.push({ model: body.model, keys: Object.keys(props), hasImage: JSON.stringify(body.messages).includes('"type":"image"') });
  if (props.es_ine) return { es_ine: true, nombres: "PRUEBA ANA", apellido_paterno: "SINTETICO", apellido_materno: "EJEMPLO", fecha_nacimiento: "1985-05-05", sexo: "M", curp: CURP, clave_elector: "SNEJPR85050509M100", calle: "FALSA", numero_exterior: "123", numero_interior: "4", colonia: "CENTRO", codigo_postal: "06000", municipio: "CUAUHTEMOC", estado: "Ciudad de México", vigencia: "2033", ilegibles: [] };
  if (props.tono) return { resumen: "Cercano y directo, siempre con emoji.", tono: "cercano", trato: "tu", saludo_tipico: "¡Hola! 😃", despedida_tipica: "Quedo atento 👍", emojis: ["😃", "👍"], longitud: "corta", frases_tipicas: ["Con gusto"], como_abre_conversacion: "Saluda por nombre", como_pide_datos: "Pregunta contado o crédito", como_maneja_objeciones: "Ofrece prueba de manejo", como_cierra: "Agenda cita", evita: ["dar precio sin versión"] };
  if (props.auto_interes) return { nombre: "Ana Cliente", auto_interes: "CR-V", presupuesto: "", forma_pago: "credito", enganche: "120 mil", plazo_meses: "", cuando_compra: "este mes", etapa: "credito", resumen: "Quiere CR-V a crédito con 120 mil de enganche.", siguiente_paso: "Pedir documentos", dias_para_seguimiento: 2 };
  if (props.plantillas) return { plantillas: [{ id: "seguimiento", texto: "¡Hola Ana! 😃 ¿Cómo vas con la decisión de la CR-V?" }, { id: "cotizacion", texto: "¡Hola Ana! Te mando la cotización de la CR-V 👍" }] };
  if (props.titulo) return { texto: "¡Estrena tu CR-V este mes! Escríbeme por WhatsApp 😃", titulo: "CR-V 2026", descripcion: "Agenda tu prueba de manejo", llamado_accion: "Enviar mensaje", hashtags: ["#Honda", "#CRV"] };
  return "¡Hola Lupita! 😃 Con gusto te ayudo. ¿Lo buscas de contado o a crédito?";
}
async function aiRoute(route) {
  const req = route.request();
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS" };
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  if (req.url().includes("/v1/models/")) return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ type: "model", id: "claude-opus-5-5", display_name: "Claude Opus 5.5", created_at: "2026-01-01T00:00:00Z" }) });
  const body = JSON.parse(req.postData() ?? "{}");
  const out = aiAnswer(body);
  const text = typeof out === "string" ? out : JSON.stringify(out);
  return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }) });
}

// ───────── Archivos sintéticos ─────────
async function syntheticBbvaForm() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 2000]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  let y = 1980;
  const widgets = new Map();
  for (const sl of BBVA_ADAPTER.slots) {
    if (!sl.field) continue;
    const m = /^(.*)#(\d+)$/.exec(sl.field);
    const base = m ? m[1] : sl.field;
    const idx = m ? Number(m[2]) : 0;
    if (sl.pdfType === "checkbox") {
      const cb = form.getFieldMaybe(base) ?? form.createCheckBox(base);
      while ((widgets.get(base) ?? 0) <= idx) { cb.addToPage(page, { x: 20 + (widgets.get(base) ?? 0) * 14, y, width: 10, height: 10 }); widgets.set(base, (widgets.get(base) ?? 0) + 1); }
    } else if (!form.getFieldMaybe(base)) form.createTextField(base).addToPage(page, { x: 200, y, width: 300, height: 12, font });
    y -= 12;
  }
  const file = path.join(TMP, "BBVA-solicitud-sintetica.pdf");
  fs.writeFileSync(file, await doc.save());
  return file;
}

const b = await chromium.launch();
// Foto sintética de una INE (persona inexistente)
const card = await b.newPage({ viewport: { width: 1000, height: 630 } });
await card.setContent(`<body style="margin:0;font-family:Arial;background:#e8efe9">
<div style="position:absolute;left:300px;top:20px;font-size:26px;font-weight:bold">INSTITUTO NACIONAL ELECTORAL</div>
<div style="position:absolute;left:300px;top:60px;font-size:20px">CREDENCIAL PARA VOTAR</div>
<div style="position:absolute;left:40px;top:120px;width:220px;height:280px;background:#bbb"></div>
<div style="position:absolute;left:310px;top:120px;font-size:15px;color:#555">NOMBRE</div>
<div style="position:absolute;left:820px;top:120px;font-size:15px;color:#555">SEXO M</div>
<div style="position:absolute;left:310px;top:146px;font-size:22px;font-weight:bold;line-height:28px">SINTETICO<br>EJEMPLO<br>PRUEBA ANA</div>
<div style="position:absolute;left:310px;top:240px;font-size:15px;color:#555">DOMICILIO</div>
<div style="position:absolute;left:310px;top:264px;font-size:20px;line-height:27px">C FALSA 123 INT 4<br>COL CENTRO 06000<br>CUAUHTEMOC, CDMX.</div>
<div style="position:absolute;left:310px;top:370px;font-size:18px">CLAVE DE ELECTOR SNEJPR85050509M100</div>
<div style="position:absolute;left:310px;top:402px;font-size:18px">CURP ${CURP}</div>
<div style="position:absolute;left:310px;top:436px;font-size:15px;color:#555">FECHA DE NACIMIENTO</div>
<div style="position:absolute;left:310px;top:460px;font-size:20px">05/05/1985</div>
<div style="position:absolute;left:310px;top:510px;font-size:18px">SECCION 0001</div>
<div style="position:absolute;left:600px;top:510px;font-size:18px">VIGENCIA 2023 - 2033</div></body>`);
const inePng = path.join(TMP, "ine-sintetica.png");
await card.screenshot({ path: inePng });
const bbvaPdf = await syntheticBbvaForm();
const chatTxt = path.join(TMP, "Chat de WhatsApp con Ana Cliente.txt");
fs.writeFileSync(chatTxt, "9/10/26, 10:31 a. m. - Ana Cliente: Hola, ¿cuánto cuesta la CR-V?\n9/10/26, 10:33 a. m. - Asesor Prueba: ¡Hola Ana! 😃 Con gusto te paso precio y versiones. ¿De contado o crédito?\n9/10/26, 10:36 a. m. - Ana Cliente: A crédito, tengo 120 mil de enganche\n9/10/26, 10:40 a. m. - Asesor Prueba: Perfecto 👍 te preparo la corrida. ¿Te late venir el sábado a manejarla?\n");

const ctx = await b.newContext({ ...devices["iPhone 13"], acceptDownloads: true });
const wa = [];
await ctx.route("https://wa.me/**", (r) => { wa.push(decodeURIComponent(r.request().url())); r.fulfill({ status: 200, body: "wa" }); });
await ctx.route("https://api.anthropic.com/**", aiRoute);
// ───────── Google Apps Script simulado (la prueba real es el botón «Probar» en la cuenta del usuario) ─────────
const GOOGLE_URL = "https://script.google.com/macros/s/PRUEBA_SOFIA/exec";
const googleCalls = [];
await ctx.route("https://script.google.com/**", async (route) => {
  const body = JSON.parse(route.request().postData() ?? "{}");
  googleCalls.push(body);
  const reply = (o) => route.fulfill({ status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
  if (body.token !== "clave-google") return reply({ ok: false, error: "Clave incorrecta" });
  const now = new Date().toISOString();
  switch (body.action) {
    case "estado": return reply({ ok: true, version: "google-prueba", cuenta: "asesor@example.com", servicios: { datos: true, correo: true, calendario: true, ocr: true }, correo: { cuotaRestante: 99, agenteActivo: false, seguimientoAuto: false, dias: 3, texto: "", casos: 0 } });
    case "correo.enviar": return reply({ ok: true, ref: body.ref, threadId: "hilo-1", enviadoAt: now, adjuntos: body.attachments.length, cuotaRestante: 98 });
    case "correo.revisar": return reply({ ok: true, casos: [{ ref: body.refs?.[0], asunto: "Trámite de placas", enviadoAt: now, esperando: false, respuestas: [{ de: "gestoria@example.com", fecha: now, texto: "Buen día, las placas ya están listas, pueden pasar por ellas.", adjuntos: [], estado: "placas_listas" }], sugerido: { clave: "placas_listas", texto: "Placas listas", coincidencia: "ya están listas" } }] });
    case "calendario.guardar": return reply({ ok: true, id: `evento-${googleCalls.length}` });
    case "ocr": return reply({ ok: true, texts: body.images.map(() => INE_TEXT) });
    default: return reply({ ok: true });
  }
});
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
const shot = (n) => p.screenshot({ path: `${shots}/${n}.png`, fullPage: true });
const cardOf = (title) => p.locator("section.card", { hasText: title });
const connectServer = async () => {
  const c = cardOf("Servidor (conector)");
  await c.locator("label.field", { hasText: "Dirección" }).locator("input").fill(BASE.replace(/\/$/, ""));
  await c.locator("label.field", { hasText: "Clave" }).locator("input").fill("clave-prueba");
  await c.getByRole("button", { name: "Conectar y probar" }).click();
  await p.getByText("+52 81 0000 0000").first().waitFor();
};
const fieldIn = (label) => p.locator("label.field", { has: p.locator("span", { hasText: new RegExp(`^${label}`) }) }).first();
const fill = async (label, value) => {
  const f = fieldIn(label);
  const sel = f.locator("select");
  if (await sel.count()) await sel.selectOption(value);
  else { await f.locator("input").fill(value); await f.locator("input").blur(); }
};

// ───── A. Sin IA: cliente, INE por texto, solicitud oficial BBVA ─────
await p.goto(BASE);
await p.getByPlaceholder("Tu nombre").fill("Asesor Prueba");
await p.getByPlaceholder("Nombre de la agencia").fill("Agencia Demo");
await p.getByRole("button", { name: "Empezar" }).click();
step("bienvenida");
await p.getByRole("button", { name: "Solicitud de crédito con INE" }).click();
await p.getByPlaceholder("Nombre y apellidos").fill("Prueba Ana Sintético Ejemplo");
await p.getByPlaceholder("81 1234 5678").fill("8111111111");
await p.getByPlaceholder("Ej. CR-V Touring 2026").fill("CR-V Touring");
await p.getByRole("button", { name: "Continuar a la INE" }).click();
await p.getByRole("button", { name: "Pegar texto de la INE" }).click();
await p.locator(".modal textarea").fill(INE_TEXT);
await p.getByRole("button", { name: "Leer" }).click();
await p.getByText("Datos leídos de la INE").waitFor();
await p.getByRole("button", { name: "Usar estos datos" }).click();
await p.waitForTimeout(300);
if (!(await fieldIn("CURP").locator("input").inputValue()).startsWith("SIEP850505")) throw new Error("CURP no aplicada");
step("INE leída (texto) y aplicada");
await fill("Banco", "BBVA");
await p.waitForTimeout(300);
const DATA = { "RFC": "SIEP850505AB1", "Estado civil": "single", "Dependientes": "0", "Correo": "ana@example.com", "Estudios": "bachelor", "La vivienda es": "owned", "Años en el domicilio": "5", "Situación laboral": "employed", "Tipo de empresa": "private", "Empresa": "EMPRESA DEMO SA", "Giro": "COMERCIO", "Puesto": "GERENTE", "Antigüedad \\(años\\)": "5", "Ingreso fijo mensual": "45000", "Teléfono del trabajo": "8133333333", "Calle del trabajo": "INDUSTRIAL", "Número exterior \\(trabajo\\)": "50", "Colonia \\(trabajo\\)": "OBRERA", "CP \\(trabajo\\)": "64000", "Municipio \\(trabajo\\)": "MONTERREY", "Estado \\(trabajo\\)": "NUEVO LEON", "Referencia familiar · nombre": "REF UNO", "Referencia familiar · teléfono": "8122222222", "Referencia familiar · dirección": "CALLE 1", "Referencia personal · nombre": "REF DOS", "Referencia personal · teléfono": "8144444444", "Referencia personal · dirección": "CALLE 2", "Precio": "650000", "Enganche": "130000", "Plazo": "48", "Tasa anual": "13.5" };
for (const [k, v] of Object.entries(DATA)) await fill(k, v);
await p.waitForTimeout(700);
const analysis = await p.locator(".card", { hasText: "Análisis automático" }).innerText();
if (!analysis.includes("Todos los datos que pide BBVA están completos")) throw new Error(`Faltan datos: ${analysis}`);
step("formulario BBVA completo (obligatorios según el banco)");
await p.locator('input[type=file][accept="application/pdf"]').setInputFiles(bbvaPdf);
await p.getByRole("button", { name: "Llenar solicitud oficial BBVA" }).waitFor();
await shot("01-credito-bbva");
await p.getByRole("button", { name: "Llenar solicitud oficial BBVA" }).click();
await p.getByText("Solicitud BBVA lista").waitFor();
const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Abrir / compartir PDF" }).click()]);
const out = path.join(TMP, "oficial.pdf");
await dl.saveAs(out);
const filled = (await PDFDocument.load(fs.readFileSync(out))).getForm();
const fieldName = (slot) => BBVA_ADAPTER.slots.find((s) => s.slot === slot).field;
if (filled.getTextField(fieldName("bbva.cliente.curp")).getText() !== CURP) throw new Error("PDF oficial sin CURP");
const gen = filled.getField(fieldName("bbva.cliente.genero_f").split("#")[0]);
if (!(gen instanceof PDFCheckBox)) throw new Error("casilla de género inexistente");
step(`PDF oficial BBVA llenado: CURP y ${filled.getTextField(fieldName("bbva.empleo.ingreso_fijo")).getText()} de ingreso`);
await p.getByRole("button", { name: "Pre-solicitud Sofía (resumen + INE)" }).click();
await p.waitForTimeout(500);

// ───── B. Conexiones reales (servidor + IA) ─────
await p.goto(BASE + "#/conexiones");
await connectServer();
await fieldIn("Llave de API de Anthropic").locator("input").fill("sk-ant-prueba");
await cardOf("Inteligencia artificial").getByRole("button", { name: "Conectar y probar" }).click();
await p.getByText("Conectada · Claude Opus 5.5").waitFor();
await shot("02-conexiones");
step("conexiones: servidor ✓, WhatsApp ✓ (Graph API), Facebook ✓, IA ✓");

// ───── C. INE por FOTO con IA + lector del teléfono ─────
await p.goto(BASE + "#/cliente/nuevo?siguiente=credito");
await p.getByPlaceholder("Nombre y apellidos").fill("Foto INE Sintética");
await p.getByRole("button", { name: "Continuar a la INE" }).click();
await p.locator(".ine-slot").first().locator("input[type=file]:not([capture])").setInputFiles(inePng);
await p.getByText("IA + lectores gratis").waitFor({ timeout: 60000 });
const table = await p.locator(".reading table").innerText();
for (const want of ["SINTETICO", "PRUEBA", "06000", "2033", CURP]) if (!table.includes(want)) throw new Error(`Foto sin ${want}: ${table}`);
if (!aiCalls.some((c) => c.keys.includes("es_ine") && c.hasImage)) throw new Error("La IA no recibió la foto");
await shot("03-ine-ia");
step(`INE por foto: IA + lectores gratis (${(table.match(/✓ verificado/g) ?? []).length} campos verificados por ambos)`);

// ───── D. Mi estilo: chats exportados + IA ─────
await p.goto(BASE + "#/estilo");
await p.locator('input[type=file][multiple]').setInputFiles(chatTxt);
await p.getByText("¿Cuál eres tú?").waitFor();
await p.locator(".modal .item", { hasText: "Asesor Prueba" }).click();
await p.getByText("Clientes en estos chats").waitFor();
await p.getByRole("button", { name: "✨ Analizar mi estilo con IA" }).click();
await p.getByText("Así vendes (según la IA)").waitFor();
await p.getByRole("button", { name: "✨ Agregar con IA" }).click();
await p.getByText("Ya es cliente").waitFor();
await shot("04-estilo");
step("estilo aprendido de chats + cliente creado desde el chat con IA");

// ───── E. Plantillas personalizadas por cliente ─────
await p.goto(BASE + "#/clientes");
await p.locator(".item strong", { hasText: "Ana Cliente" }).first().click();
const anaUrl = p.url();
const anaId = anaUrl.split("/cliente/")[1];
await p.goto(BASE + `#/whatsapp?tab=escribir&c=${anaId}`);
await p.getByRole("button", { name: "✨ Plantillas para Ana" }).click();
await p.getByText("✨ Seguimiento").waitFor();
step("plantillas personalizadas para el cliente con su estilo");

// ───── F. Bandeja real: webhook firmado → borrador IA → enviar por la API ─────
await webhook(waIn("wamid.IN1", { type: "text", text: { body: "Hola, vi su anuncio de la CR-V, ¿la tienen en blanco?" } }));
await webhook(waIn("wamid.IMG1", { type: "image", image: { id: "555", mime_type: "image/png", caption: "mi INE" } }));
await p.goto(BASE + "#/whatsapp?tab=bandeja");
await p.locator(".item strong", { hasText: "Lupita Prospecto" }).first().click();
await p.getByText("vi su anuncio de la CR-V").waitFor();
await p.getByRole("button", { name: "Ver foto" }).click();
await p.getByRole("button", { name: "Usar como INE (frente)" }).waitFor();
await p.getByRole("button", { name: "✨ Sugerir con IA" }).click();
await p.waitForFunction(() => document.querySelector(".page textarea")?.value.includes("Lupita"));
await shot("05-bandeja");
await p.getByRole("button", { name: "Enviar", exact: true }).click();
await p.getByText("Enviado", { exact: true }).waitFor();
const sent = graphCalls.find((c) => c.path === "/v/111/messages" && c.body.includes("Lupita"));
if (!sent || JSON.parse(sent.body).to !== "5218199998888") throw new Error("No se envió por la API de WhatsApp");
step("bandeja: mensaje entrante → borrador IA → enviado por WhatsApp Cloud API");
await p.getByRole("button", { name: "Usar como INE (frente)" }).click();
await p.getByText("Datos leídos de la INE").waitFor({ timeout: 60000 });
step("foto recibida por WhatsApp → cliente creado → INE leída para su crédito");

// ───── G. Redes: publicar en la página con IA ─────
await p.goto(BASE + "#/redes");
await p.getByPlaceholder("Ej. CR-V Touring 2026, blanca").fill("CR-V 2026");
await p.getByRole("button", { name: "✨ Escribir con IA" }).click();
await p.waitForFunction(() => [...document.querySelectorAll("textarea")].some((t) => t.value.includes("#Honda")));
await p.getByRole("button", { name: "Publicar ahora" }).click();
await p.getByText("¡Publicado en tu página!").waitFor();
if (!graphCalls.some((c) => c.path === "/v/333/feed" && c.body.includes("Estrena tu CR-V"))) throw new Error("No se publicó en la página");
await p.getByRole("button", { name: "✨ Crear anuncio con IA" }).click();
await p.getByText("Texto principal").waitFor();
await shot("06-redes");
step("redes: publicación en Facebook con IA + copy de anuncio");

// ───── H. Placas, ficha, recordatorios, comentarios ─────
await p.goto(BASE + "#/clientes");
await p.locator(".item strong", { hasText: "Prueba Ana Sintético Ejemplo" }).first().click();
await p.getByRole("button", { name: "Mañana" }).click();
await p.getByPlaceholder(/Escribe una nota/).fill("Le interesa a 48 meses.");
await p.getByRole("button", { name: "Guardar nota" }).click();
await p.getByRole("button", { name: /Trámite de placas/ }).click();
await p.getByRole("checkbox", { name: "Factura del vehículo" }).check();
await p.locator(".item", { hasText: "INE del titular" }).locator("input[type=file]").setInputFiles({ name: "ine.png", mimeType: "image/png", buffer: fs.readFileSync(ICON) });
await p.waitForTimeout(400);
await p.getByRole("button", { name: "Rehacer con lo recibido" }).click();
if (!(await fieldIn("Mensaje").locator("textarea").inputValue()).includes("INE del titular")) throw new Error("Correo sin documentos");
await p.getByRole("button", { name: "Ya lo envié" }).click();
step("placas: documentos y correo");
await p.getByRole("button", { name: "Dejar un comentario sobre la app" }).click();
await p.locator(".modal textarea").fill("Me gustaría ver la cotización en el PDF.");
await p.getByRole("button", { name: "Guardar" }).click();
await p.goto(BASE + "#/");
await shot("07-hoy");
await p.goto(BASE + "#/mas");
await shot("08-mas");

// ───── I. Respaldo en el servidor: subir, borrar, traer ─────
await p.goto(BASE + "#/ajustes");
await p.getByRole("button", { name: "Subir al servidor ahora" }).click();
await p.getByText("Datos guardados en el servidor").waitFor();
await p.getByRole("button", { name: "Borrar todos los datos" }).click();
await p.locator(".modal").getByRole("button", { name: "Borrar todo" }).click();
await p.waitForTimeout(400);
await p.goto(BASE + "#/conexiones");
if (await p.getByRole("button", { name: "Empezar" }).isVisible().catch(() => false)) await p.getByRole("button", { name: "Empezar" }).click();
await connectServer();
await p.goto(BASE + "#/ajustes");
await p.getByRole("button", { name: "Traer del servidor" }).click();
await p.locator(".modal").getByRole("button", { name: "Traer" }).click();
await p.getByText("Datos actualizados desde el servidor").waitFor();
await p.goto(BASE + "#/clientes");
await p.locator(".item strong", { hasText: "Prueba Ana Sintético Ejemplo" }).first().waitFor();
step("respaldo: subido, borrado y restaurado desde el servidor");

// ───── K. Google gratis: Gmail (agente de correo), Calendar y lector de Drive ─────
await p.goto(BASE + "#/conexiones");
await cardOf("Google (gratis)").locator("label.field", { hasText: "Dirección del script" }).locator("input").fill(GOOGLE_URL);
await cardOf("Google (gratis)").locator("label.field", { hasText: "Clave" }).locator("input").fill("clave-google");
await cardOf("Google (gratis)").getByRole("button", { name: "Conectar y probar" }).click();
await p.getByText("Cuenta: asesor@example.com").waitFor();
await p.waitForTimeout(4000); // la sincronización con el calendario espera a que dejes de editar
if (!googleCalls.some((c) => c.action === "calendario.guardar" && c.inicio && c.avisos?.length)) throw new Error("Los recordatorios no se mandaron a Google Calendar");
step(`Google: cuenta conectada y ${googleCalls.filter((c) => c.action === "calendario.guardar").length} recordatorio(s) en Google Calendar`);
await p.goto(BASE + "#/clientes");
await p.locator(".item strong", { hasText: "Prueba Ana Sintético Ejemplo" }).first().click();
await p.getByRole("button", { name: /Trámite de placas/ }).click();
await fieldIn("Para").locator("input").fill("gestoria@example.com");
await fieldIn("Para").locator("input").blur();
await p.getByRole("button", { name: "Enviar desde mi Gmail (con adjuntos)" }).click();
await p.getByText(/Enviado desde tu Gmail/).waitFor();
const mail = googleCalls.find((c) => c.action === "correo.enviar");
if (mail?.to !== "gestoria@example.com" || !mail.attachments?.length || !mail.attachments[0].base64) throw new Error("El correo no llevó destinatario o adjuntos");
await p.getByRole("button", { name: "Revisar respuestas" }).click();
await p.getByRole("button", { name: "Aplicar: Placas listas" }).click();
await p.getByText("Estado actualizado").waitFor();
await shot("10-placas-gmail");
step(`agente de correo: enviado desde Gmail con ${mail.attachments.length} adjunto(s), respuesta leída y estado «Placas listas» aplicado`);
await p.goto(BASE + "#/cliente/nuevo?siguiente=credito");
await p.getByPlaceholder("Nombre y apellidos").fill("Doble lector");
await p.getByRole("button", { name: "Continuar a la INE" }).click();
// Sin IA para esta prueba: teléfono + Google
await p.evaluate(async () => { const { state, save } = await import("./js/store.js"); state.settings.ai.enabled = false; await save(); });
await p.reload();
await p.locator(".ine-slot").first().locator("input[type=file]:not([capture])").setInputFiles(inePng);
await p.getByText("Teléfono + Google").waitFor({ timeout: 60000 });
if (!googleCalls.some((c) => c.action === "ocr" && c.images?.[0]?.base64)) throw new Error("No se pidió la lectura a Google");
step("INE: lector del teléfono + lector de Google comparados campo por campo");

// ───── L. Agente de WhatsApp sin IA: contesta solo y anota prospectos ─────
await p.goto(BASE + "#/whatsapp?tab=auto");
await p.getByText("Contestar automáticamente").click();
await cardOf("Respuestas automáticas").getByRole("button", { name: "Guardar" }).click();
await p.getByText(/Sofía contesta sola/).waitFor();
const before = graphCalls.length;
await webhook({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { contacts: [{ wa_id: "5218177776666", profile: { name: "Pedro Nuevo" } }], messages: [{ from: "5218177776666", id: "wamid.NUEVO1", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Hola, ¿cuánto cuesta el City?" } }] } }] }] });
await new Promise((r) => setTimeout(r, 800));
const auto = graphCalls.slice(before).find((c) => c.path === "/v/111/messages");
if (!auto || !/Pedro/.test(auto.body)) throw new Error(`El agente no contestó solo: ${auto?.body}`);
step(`agente WhatsApp: contestó solo sin IA → «${JSON.parse(auto.body).text.body.slice(0, 70)}…»`);
await p.reload(); // misma dirección: recargar para traer los prospectos nuevos
await p.locator(".item strong", { hasText: "Pedro Nuevo" }).waitFor();
await p.locator(".item", { hasText: "Pedro Nuevo" }).getByRole("button", { name: "Agregar como cliente" }).click();
await p.getByText("Pedro Nuevo agregado a clientes").waitFor();
await shot("11-agente-whatsapp");
step("prospecto nuevo convertido en cliente");

// ───── M. Programar publicación (sale sola a la hora) y cancelar ─────
await p.goto(BASE + "#/redes");
await fieldIn("Texto").locator("textarea").fill("Ven a manejar la nueva CR-V este sábado.");
const later = new Date(Date.now() + 2 * 86400000);
const pad = (n) => String(n).padStart(2, "0");
await cardOf("Dónde y cuándo").locator('input[type="datetime-local"]').fill(`${later.getFullYear()}-${pad(later.getMonth() + 1)}-${pad(later.getDate())}T10:30`);
await cardOf("Dónde y cuándo").getByRole("button", { name: "Programar" }).click();
await p.getByText(/Programada para/).waitFor();
await cardOf("Programadas").getByText("Programada ·").first().waitFor();
await shot("12-redes-programadas");
await cardOf("Programadas").getByRole("button", { name: "Cancelar" }).first().click();
await p.getByText("Cancelada").waitFor();
step("redes: publicación programada en el servidor y cancelada");

// ───── J. Lector sin IA en el navegador (ruta iPhone/PC sin conexión de IA) ─────
const ctx2 = await b.newContext({ ...devices["Pixel 7"] });
const p2 = await ctx2.newPage();
p2.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await p2.goto(BASE);
await p2.getByRole("button", { name: "Empezar" }).click().catch(() => {});
await p2.goto(BASE + "#/cliente/nuevo?siguiente=credito");
await p2.getByPlaceholder("Nombre y apellidos").fill("Foto sin IA");
await p2.getByRole("button", { name: "Continuar a la INE" }).click();
const t0 = Date.now();
await p2.locator(".ine-slot").first().locator("input[type=file]:not([capture])").setInputFiles(inePng);
await p2.getByText("Datos leídos de la INE").waitFor({ timeout: 120000 });
const table2 = await p2.locator(".reading table").innerText();
for (const want of ["SINTETICO", "PRUEBA", "06000", "2033", CURP]) if (!table2.includes(want)) throw new Error(`Lector sin IA no dio ${want}: ${table2}`);
step(`lector sin IA: INE por foto en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await p2.screenshot({ path: `${shots}/09-ine-sin-ia.png` });

console.log(`Capturas: ${shots}`);
await b.close();
fakeMeta.close();
if (errors.length) { console.error("ERRORES:\n" + errors.join("\n")); process.exit(1); }
console.log("OK: prueba completa sin errores.");
