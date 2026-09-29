/**
 * QA del modo tablet (mismo user-agent que la APK) contra una app en ejecución, con datos DEMO:
 * inicio → buscar cliente → subir documentos → revisar/confirmar → Solicitud BBVA → PDF generado
 * (Ver/Compartir/Guardar) → seguimiento → correo de placas. Capturas en qa-screenshots/ (ignorado).
 *   BASE_URL=http://localhost:3000 node scripts/qa-tablet.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("qa-screenshots");
fs.mkdirSync(OUT, { recursive: true });
const fail = (m) => {
  throw new Error(`QA tablet: ${m}`);
};
const log = (...a) => console.log("•", ...a);

// Documento sintético con capa de texto (CURP DEMO): nunca datos reales.
const d = await PDFDocument.create();
const f = await d.embedFont(StandardFonts.Helvetica);
d.addPage().drawText("CONSTANCIA DE PRUEBA (DEMO)  CURP DEMO900102MDFXXX05  correo ana.nueva@example.com", { x: 30, y: 700, size: 10, font: f });
const pdfPath = path.join(OUT, "doc-demo.pdf");
fs.writeFileSync(pdfPath, await d.save());

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 1280 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, locale: "es-MX", userAgent: "Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/130 Safari/537.36 SofiaTablet/1" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(`error de página: ${e.message}`));
  const shot = (n, full = false) => page.screenshot({ path: path.join(OUT, `tablet-${n}.png`), fullPage: full });

  await page.goto(`${BASE}/`);
  await page.getByText("SOLICITUDES", { exact: true }).waitFor();
  if (await page.getByRole("link", { name: "Cotizar" }).count()) fail("Cotizar sigue visible en modo tablet");
  for (const hidden of ["Reglas", "Simulador", "Programas"]) if (await page.getByText(hidden, { exact: true }).count()) fail(`${hidden} visible en modo tablet`);
  await shot("01-inicio", true);
  log("inicio tablet sin cotizador ni herramientas de desarrollo");

  const input = page.locator('input[aria-label="Comando para Sofía"]');
  await input.fill("Ana");
  await page.getByRole("link", { name: /Ana López \(DEMO\)/ }).first().click();
  await page.getByText("Está esperando").waitFor();
  const customerUrl = page.url().split("?")[0];
  await shot("02-cliente", true);
  log("ficha: nombre, # cliente y resumen operativo");

  await page.getByRole("link", { name: /Documentos/ }).first().click();
  await page.getByText("¿Qué documento es?").waitFor();
  await page.locator("select").first().selectOption("curp");
  await page.locator('input[type=file][multiple]').setInputFiles(pdfPath);
  await page.getByText(/documento\(s\) subido\(s\)/).waitFor({ timeout: 20000 });
  await page.reload();
  await shot("03-documentos");
  await page.locator('a[href*="/documents/"]').first().click();
  await page.getByText("DATOS ENCONTRADOS").waitFor();
  await shot("04-revisar", true);
  const confirmBtns = page.getByRole("button", { name: "Confirmar", exact: true });
  const n = await confirmBtns.count();
  if (n < 1) fail("no hay datos para confirmar");
  await confirmBtns.first().click();
  await page.getByText("Confirmado").first().waitFor();
  log(`revisión: ${n} dato(s) leídos como observados; confirmado 1`);

  await page.goto(`${customerUrl}/credit`);
  await page.getByRole("button", { name: "BBVA" }).click();
  await page.waitForURL(/\/credit\/[0-9a-f-]{36}/);
  const appUrl = page.url().split("?")[0];
  await page.goto(`${appUrl}?step=pdf`);
  await page.getByRole("button", { name: "Generar borrador PDF" }).click();
  await page.getByText("SOLICITUD GENERADA").waitFor();
  for (const b of ["Ver PDF", "Compartir", "Guardar"]) if (!(await page.getByRole("button", { name: b }).first().count())) fail(`falta botón ${b}`);
  await shot("05-solicitud-generada", true);
  log("solicitud BBVA generada con Ver / Compartir / Guardar");

  await page.goto(`${BASE}/followups`);
  await page.getByRole("button", { name: /Posponer/ }).first().waitFor();
  await shot("06-seguimiento", true);

  await page.goto(`${BASE}/plates`);
  await page.getByText("PENDIENTES").waitFor();
  await page.locator('a[href^="/plates/"]').first().click();
  await page.getByRole("button", { name: "Preparar correo de placas" }).click();
  await page.getByText("Compartir con adjuntos").waitFor();
  await shot("07-correo-placas", true);
  log("correo de placas: Compartir con adjuntos / Marcar enviado");

  await page.goto(customerUrl);
  await shot("08-cliente-despues", true);
  await ctx.close();
  log(`OK — capturas en ${OUT}`);
} finally {
  await browser.close();
}
