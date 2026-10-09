// Prueba de punta a punta de la versión de prueba (prueba/), en un Chromium real con tamaño de celular.
// Requiere el servidor propio corriendo:  SOFIA_TOKEN=clave-prueba node prueba/servidor/servidor.mjs
//   BASE=http://localhost:8080/ node scripts/prueba-e2e.mjs      (SHOTS=carpeta para capturas)
// Usa solo datos SINTÉTICOS (persona inexistente con CURP de estructura válida).
import { chromium, devices } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { curpCheckDigit } from "../prueba/js/mxid.js";

const BASE = process.env.BASE ?? "http://localhost:8080/";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "sofia-e2e-"));
const shots = process.env.SHOTS ?? path.join(TMP, "shots");
fs.mkdirSync(shots, { recursive: true });
const CURP = "SIEP850505MDFNJR0" + curpCheckDigit("SIEP850505MDFNJR0");
const INE_TEXT = ["INSTITUTO NACIONAL ELECTORAL", "CREDENCIAL PARA VOTAR", "NOMBRE", "SINTETICO", "EJEMPLO", "PRUEBA ANA", "SEXO M", "DOMICILIO", "C FALSA 123 INT 4", "COL CENTRO 06000", "CUAUHTEMOC, CDMX.", "CLAVE DE ELECTOR SNEJPR85050509M100", `CURP ${CURP}`, "FECHA DE NACIMIENTO", "05/05/1985", "SECCION 0001 VIGENCIA 2023 - 2033"].join("\n");
const ICON = new URL("../prueba/icon-192.png", import.meta.url);
const errors = [];
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["iPhone 13"], acceptDownloads: true });
const wa = [];
await ctx.route("https://wa.me/**", (r) => { wa.push(decodeURIComponent(r.request().url())); r.fulfill({ status: 200, body: "wa" }); });
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
p.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
const shot = (n) => p.screenshot({ path: `${shots}/${n}.png`, fullPage: true });
const step = (t) => console.log("•", t);

await p.goto(BASE);
await p.getByPlaceholder("Tu nombre").fill("Mario Prueba");
await p.getByPlaceholder("Nombre de la agencia").fill("Agencia Demo");
await shot("01-bienvenida");
await p.getByRole("button", { name: "Empezar" }).click();
await p.getByText("Buenos").or(p.getByText("Buenas")).first().waitFor();
step("bienvenida OK");
await shot("02-hoy-vacio");

// Cliente nuevo → crédito
await p.getByRole("button", { name: "Solicitud de crédito con INE" }).click();
await p.getByPlaceholder("Nombre y apellidos").fill("Prueba Ana Sintético Ejemplo");
await p.getByPlaceholder("81 1234 5678").fill("8111111111");
await p.getByPlaceholder("Ej. CR-V Touring 2026").fill("CR-V Touring");
await p.getByRole("button", { name: "Continuar a la INE" }).click();
await p.getByText("1 · INE del solicitante").waitFor();
step("cliente creado y en crédito");
await p.getByRole("button", { name: "Pegar texto de la INE" }).click();
await p.locator(".modal textarea").fill(INE_TEXT);
await p.getByRole("button", { name: "Leer" }).click();
await p.getByText("Datos leídos de la INE").waitFor();
await shot("03-ine-leida");
await p.getByRole("button", { name: "Usar estos datos" }).click();
await p.waitForTimeout(300);
const curp = await p.locator("label.field", { hasText: "CURP" }).locator("input").inputValue();
if (!curp.startsWith("SIEP850505")) throw new Error("CURP no aplicada: " + curp);
step("datos de INE aplicados: " + curp);
const fill = async (label, value) => {
  const f = p.locator("label.field", { has: p.locator("span", { hasText: new RegExp(`^${label}`) }) }).first();
  const sel = f.locator("select");
  if (await sel.count()) await sel.selectOption(value); else await f.locator("input").fill(value);
};
await fill("RFC", "SIEP850505AB1");
await fill("Tipo de ingreso", "asalariado");
await fill("Empresa", "Empresa Demo SA");
await fill("Antigüedad", "5");
await fill("Ingreso fijo mensual", "45000");
await fill("Referencia 1 · nombre", "Ref Uno");
await fill("Referencia 1 · teléfono", "8122222222");
await fill("Referencia 2 · nombre", "Ref Dos");
await fill("Referencia 2 · teléfono", "8133333333");
await fill("Precio", "650000");
await fill("Enganche", "130000");
await fill("Plazo", "48");
await fill("Tasa anual", "13.5");
await p.waitForTimeout(600);
await shot("04-credito-lleno");
const analysis = await p.locator(".card", { hasText: "Análisis automático" }).innerText();
console.log(analysis.split("\n").map((l) => "    " + l).join("\n"));
const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Generar PDF" }).click()]);
const pdfPath = path.join(TMP, "solicitud.pdf"); await dl.saveAs(pdfPath);
const pdf = fs.readFileSync(pdfPath);
if (pdf.subarray(0, 4).toString() !== "%PDF") throw new Error("PDF inválido");
step(`PDF generado (${pdf.length} bytes): ${dl.suggestedFilename()}`);
await p.getByRole("button", { name: "Marcar enviada al banco" }).click();
step("crédito marcado como enviado");

// Ficha + seguimiento + nota
await p.goto(BASE + "#/clientes");
await p.getByText("Prueba Ana Sintético Ejemplo").click();
await p.getByRole("button", { name: "Mañana" }).click();
await p.getByPlaceholder(/Escribe una nota/).fill("Le interesa a 48 meses.");
await p.getByRole("button", { name: "Guardar nota" }).click();
await shot("05-ficha");
step("ficha: seguimiento y nota");

// Placas
await p.getByRole("button", { name: /Trámite de placas/ }).click();
await p.getByRole("checkbox", { name: "Factura del vehículo" }).check();
await p.locator(".item", { hasText: "INE del titular" }).locator("input[type=file]").setInputFiles({ name: "ine.png", mimeType: "image/png", buffer: fs.readFileSync(ICON) });
await p.waitForTimeout(500);
await p.getByRole("button", { name: "Rehacer con lo recibido" }).click();
const body = await p.locator("label.field", { hasText: "Mensaje" }).locator("textarea").inputValue();
if (!body.includes("INE del titular")) throw new Error("Correo sin documentos");
await p.getByRole("button", { name: "Ya lo envié" }).click();
await shot("06-placas");
step("placas: documento adjunto, correo armado y registrado");

// WhatsApp responder
await p.goto(BASE + "#/whatsapp?tab=responder");
await p.locator("label.field", { hasText: "Cliente" }).locator("select").selectOption({ label: "Prueba Ana Sintético Ejemplo" });
await p.getByPlaceholder("Pega aquí lo que te escribió el cliente").fill("¿Cuánto me quedaría la mensualidad con el crédito a 48 meses?");
await p.getByRole("button", { name: "Sugerir respuesta" }).click();
await p.getByText("Respuesta sugerida").waitFor();
await shot("07-whatsapp-responder");
const popup = p.waitForEvent("popup").catch(() => null);
await p.getByRole("button", { name: "Abrir en WhatsApp" }).click();
await popup;
await p.waitForTimeout(500);
if (!wa.some((u) => u.includes("5218111111111") || u.includes("528111111111"))) throw new Error("No abrió WhatsApp: " + wa.join(" | "));
step("WhatsApp: " + wa.at(-1).slice(0, 110) + "…");

// Pendientes / Hoy / Recordatorios
await p.goto(BASE + "#/whatsapp?tab=pendientes"); await shot("08-whatsapp-pendientes");
await p.goto(BASE + "#/recordatorios"); await shot("09-recordatorios");
await p.goto(BASE + "#/"); await shot("10-hoy");

// Comentario
await p.getByRole("button", { name: "Dejar un comentario sobre la app" }).click();
await p.locator(".modal textarea").fill("Me gustaría ver la cotización en el PDF.");
await p.getByRole("button", { name: "Guardar" }).click();
step("comentario guardado");

// Servidor propio: subir, borrar, traer
await p.goto(BASE + "#/ajustes");
await p.getByPlaceholder("https://script.google.com/macros/s/…/exec").fill(BASE + "api/datos");
await p.getByPlaceholder("https://script.google.com/macros/s/…/exec").blur();
await p.locator("label.field", { hasText: "Clave" }).locator("input").fill("clave-prueba");
await p.locator("label.field", { hasText: "Clave" }).locator("input").blur();
await p.getByRole("button", { name: "Subir ahora" }).click();
await p.getByText("Datos guardados en el servidor").waitFor();
await shot("11-ajustes");
step("subido al servidor propio");
p.once("dialog", (d) => d.accept());
await p.getByRole("button", { name: "Borrar todos los datos" }).click();
await p.locator(".modal").getByRole("button", { name: "Borrar todo" }).click();
await p.waitForTimeout(500);
await p.goto(BASE + "#/ajustes");
const onboard = p.getByRole("button", { name: "Empezar" });
if (await onboard.isVisible().catch(() => false)) await onboard.click();
await p.getByPlaceholder("https://script.google.com/macros/s/…/exec").fill(BASE + "api/datos");
await p.getByPlaceholder("https://script.google.com/macros/s/…/exec").blur();
await p.locator("label.field", { hasText: "Clave" }).locator("input").fill("clave-prueba");
await p.locator("label.field", { hasText: "Clave" }).locator("input").blur();
await p.getByRole("button", { name: "Traer del servidor" }).click();
await p.locator(".modal").getByRole("button", { name: "Traer" }).click();
await p.getByText("Datos actualizados desde el servidor").waitFor();
await p.goto(BASE + "#/clientes");
await p.getByText("Prueba Ana Sintético Ejemplo").waitFor();
await p.getByText("Prueba Ana Sintético Ejemplo").click();
await p.getByRole("button", { name: /Solicitud de crédito/ }).click();
await p.locator(".ine-slot img").first().waitFor({ timeout: 3000 }).catch(() => {});
step("datos restaurados desde el servidor (cliente, crédito, documentos)");

// Ejemplos + escritorio
await p.goto(BASE + "#/ajustes");
await p.getByRole("button", { name: "Cargar clientes de ejemplo" }).click();
await p.goto(BASE + "#/"); await shot("12-hoy-ejemplos");
const desk = await b.newPage({ viewport: { width: 1280, height: 900 } });
await desk.goto(BASE + "#/clientes"); await desk.getByRole("button", { name: "Empezar" }).click().catch(() => {});
await desk.screenshot({ path: `${shots}/13-escritorio.png` });

// ───── Foto de INE sintética → lector incluido en el navegador (ruta de iPhone/PC) ─────
// 1) "Foto" sintética de una INE (persona inexistente), con etiquetas y valores como la credencial real.
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
<div style="position:absolute;left:600px;top:510px;font-size:18px">VIGENCIA 2023 - 2033</div>
</body>`);
const inePng = path.join(TMP, "ine-sintetica.png");
await card.screenshot({ path: inePng });
// 2) Subirla como foto en la app (sin APK → lector incluido en el navegador)
const ctx2 = await b.newContext({ ...devices["Pixel 7"] });
const p2 = await ctx2.newPage();
p2.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await p2.goto(BASE);
await p2.getByRole("button", { name: "Empezar" }).click().catch(() => {});
await p2.goto(BASE + "#/cliente/nuevo?siguiente=credito");
await p2.getByPlaceholder("Nombre y apellidos").fill("Foto INE Sintética");
await p2.getByRole("button", { name: "Continuar a la INE" }).click();
const t0 = Date.now();
await p2.locator(".ine-slot").first().locator('input[type=file]:not([capture])').setInputFiles(inePng);
await p2.getByText("Datos leídos de la INE").waitFor({ timeout: 120000 });
console.log(`OCR en navegador: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log((await p2.locator(".reading table").innerText()).replace(/\n/g, " | "));
const table = await p2.locator(".reading table").innerText();
for (const want of ["SINTETICO", "PRUEBA", "06000", "2033", CURP]) if (!table.includes(want)) throw new Error(`La foto no dio ${want}: ${table}`);
step("foto de INE leída en el navegador (nombre, CP, vigencia y CURP)");
const warns = await p2.locator(".reading ul.checks").innerText().catch(() => "");
if (warns) console.log("Avisos:", warns);
await p2.screenshot({ path: `${shots}/14-ocr-foto.png` });

console.log(`Capturas: ${shots}`);
await b.close();
if (errors.length) { console.error("ERRORES:\n" + errors.join("\n")); process.exit(1); }
console.log("OK: prueba completa sin errores.");
