/**
 * QA móvil con Playwright contra una app en ejecución (datos DEMO).
 *
 *   BASE_URL=http://localhost:3000 npm run qa:mobile
 *
 * 1) Recorre el flujo de la demostración en viewport iPhone (390×844):
 *    Clientes → cliente → crédito BBVA → resolver conflicto → completar → PDF →
 *    cotización validada → venta → pedido/factura → "cerrar" y reabrir → continuar.
 * 2) Toma capturas de las pantallas principales en 390×844, 430×932, 768×1024 y 1440×900.
 * Las capturas quedan en qa-screenshots/ (ignorado por git).
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { PDFCheckBox, PDFDocument, PDFTextField } from "pdf-lib";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("qa-screenshots");
fs.mkdirSync(OUT, { recursive: true });
const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const log = (...a) => console.log("•", ...a);
const fail = (msg) => {
  throw new Error(`QA: ${msg}`);
};

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

async function noHorizontalScroll(page, where) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) fail(`scroll horizontal de ${overflow}px en ${where}`);
}

async function smallInputs(page, where) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("input:not([type=hidden]):not([type=file]), select, textarea")]
      .filter((el) => el.offsetParent !== null && parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => el.getAttribute("name") ?? el.tagName),
  );
  if (small.length) fail(`inputs < 16px (zoom en iOS) en ${where}: ${small.join(", ")}`);
}

const browser = await chromium.launch(launchOpts);
try {
  // ─── 1) Flujo de demostración en iPhone ───
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-MX" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(`error de página: ${e.message}`));

  await page.goto(`${BASE}/`);
  await page.getByText("Prioridades de hoy").waitFor();
  await shot(page, "iphone-01-inicio");
  await noHorizontalScroll(page, "inicio");

  await page.getByRole("link", { name: "Clientes" }).last().click();
  await page.getByText("Cliente Conflicto (DEMO)").waitFor();
  await shot(page, "iphone-02-clientes");
  await page.getByText("Cliente Conflicto (DEMO)").click();
  await page.getByText("Siguiente paso").waitFor();
  const customerUrl = page.url().split("?")[0];
  await shot(page, "iphone-03-cliente-resumen");

  for (const [tab, name] of [["datos&s=personal", "datos-personales"], ["datos&s=employment", "empleo"], ["cotizaciones", "cotizaciones"], ["documentos", "documentos"], ["ventas", "ventas"], ["historial", "historial"]]) {
    await page.goto(`${customerUrl}?tab=${tab}`);
    await page.waitForLoadState("networkidle");
    await noHorizontalScroll(page, tab);
    await smallInputs(page, tab);
    await shot(page, `iphone-04-cliente-${name}`);
  }

  // Crédito: nueva solicitud BBVA
  await page.goto(`${customerUrl}/credit`);
  await page.getByRole("button", { name: "BBVA" }).click();
  await page.waitForURL(/\/credit\/[0-9a-f-]{36}/);
  const appUrl = page.url().split("?")[0];
  await page.getByText("Lo que Sofía ya sabe").waitFor();
  await shot(page, "iphone-05-credito-analisis");
  await page.goto(`${appUrl}?step=clasificacion`);
  await shot(page, "iphone-06-credito-clasificacion");

  // Completar: resolver conflictos usando BBVA
  await page.goto(`${appUrl}?step=completar`);
  await page.getByText("Conflicto de información").first().waitFor();
  await shot(page, "iphone-07-conflicto");
  let guard = 0;
  while ((await page.getByRole("button", { name: /^Usar BBVA/ }).count()) > 0 && guard++ < 10) {
    await page.getByRole("button", { name: /^Usar BBVA/ }).first().click();
    await page.getByText("Conflicto resuelto").first().waitFor({ timeout: 10_000 }).catch(() => {});
    await page.reload();
  }
  if (await page.getByText("Conflicto de información").count()) fail("quedaron conflictos sin resolver");
  log("conflictos resueltos con BBVA");
  // Confirmar en bloque lo leído de la solicitud previa (Mario revisa y confirma)
  await shot(page, "iphone-08-completar");
  while ((await page.getByRole("button", { name: /^Confirmar todos de/ }).count()) > 0 && guard++ < 10) {
    const before = await page.getByRole("button", { name: /^Confirmar todos de/ }).count();
    await page.getByRole("button", { name: /^Confirmar todos de/ }).first().click();
    await page.waitForFunction((n) => [...document.querySelectorAll("button")].filter((b) => b.textContent?.startsWith("Confirmar todos de")).length < n, before, { timeout: 15_000 });
    await page.reload();
  }
  // Capturar un faltante (referencias) en su sección
  if (await page.locator('input[name="reference_1_name"]').count()) {
    await page.locator('input[name="reference_1_name"]').fill("Referencia QA Uno");
    await page.locator('input[name="reference_1_phone"]').fill("5550009901");
    await page.locator('input[name="reference_1_relationship"]').fill("Hermano");
    await page.locator('input[name="reference_2_name"]').fill("Referencia QA Dos");
    await page.locator('input[name="reference_2_phone"]').fill("5550009902");
    await page.locator('input[name="reference_2_relationship"]').fill("Amiga");
    await page.getByRole("button", { name: "Guardar" }).last().click();
    await page.getByText(/^Guardado/).first().waitFor();
    await page.reload();
  }
  await shot(page, "iphone-08b-completar-despues");

  await page.goto(`${appUrl}?step=revision`);
  await page.getByText(/Datos confirmados:/).waitFor();
  await shot(page, "iphone-09-vista-previa");
  await page.goto(`${appUrl}?step=pdf`);
  await page.getByRole("button", { name: "Generar borrador PDF" }).click();
  const open = page.getByRole("link", { name: "Abrir borrador PDF" });
  await open.waitFor();
  await shot(page, "iphone-10-pdf");
  const pdfUrl = new URL(await open.getAttribute("href"), BASE).toString();
  const pdfRes = await ctx.request.get(pdfUrl);
  if (pdfRes.headers()["content-type"] !== "application/pdf") fail("la descarga no es PDF");
  const pdf = await PDFDocument.load(await pdfRes.body());
  const fields = pdf.getForm().getFields();
  const filled = fields.filter((f) => f instanceof PDFTextField && (f.getText() ?? "").trim()).length;
  for (const f of fields) {
    const n = f.getName();
    if (/firmas\.|pep\.|autorizaciones\./.test(n)) {
      if (f instanceof PDFCheckBox && f.isChecked()) fail(`casilla humana marcada: ${n}`);
      if (f instanceof PDFTextField && (f.getText() ?? "").trim()) fail(`campo humano/firma llenado: ${n}`);
    }
  }
  log(`PDF generado: ${filled} campos de texto llenados; firmas/PEP/autorizaciones vacías`);

  // Cotización validada → venta
  await page.goto(`${customerUrl}?tab=cotizaciones`);
  await page.locator('select[name="model"]').first().selectOption("City");
  await page.locator('select[name="version"]').first().selectOption("Sport");
  await page.locator('input[name="downPayment"]').first().fill("80000");
  await page.getByRole("button", { name: "Buscar corrida validada" }).click();
  await page.getByText(/Corrida validada:/).waitFor();
  await page.getByRole("button", { name: "Guardar en el cliente" }).click();
  await page.getByText("Corrida guardada en el cliente").waitFor();
  // escenario distinto: no se reutiliza
  await page.locator('input[name="downPayment"]').first().fill("120000");
  await page.getByRole("button", { name: "Buscar corrida validada" }).click();
  await page.getByText("No existe una corrida validada para este escenario.").waitFor();
  await shot(page, "iphone-11-cotizacion-no-validada");
  await page.reload();
  await page.getByRole("button", { name: "Crear venta con esta cotización" }).first().click();
  await page.waitForURL(/\/sales\/[0-9a-f-]{36}/);
  const saleUrl = page.url().split("?")[0];
  await shot(page, "iphone-12-venta");

  await page.goto(`${saleUrl}?edit=facturacion#facturacion`);
  await page.locator('input[name="orderNumber"]').fill("QA-P-001");
  await page.locator('input[name="invoiceNumber"]').fill("QA-F-001");
  await page.locator('input[name="reason"]').last().fill("Captura QA");
  await page.getByRole("button", { name: "Guardar" }).last().click();
  await page.getByText(/Guardado \(2 cambios\)/).waitFor();
  await page.goto(`${saleUrl}?edit=montos#montos`);
  await page.locator('input[name="invoiceValue"]').fill("305000");
  await page.getByRole("button", { name: "Guardar" }).last().click();
  await page.getByText(/Guardado/).waitFor();
  await page.goto(saleUrl);
  await page.locator('select[name="status"]').selectOption("invoiced");
  await page.getByRole("button", { name: "Cambiar" }).click();
  await page.getByText("Estado actualizado").waitFor();
  await shot(page, "iphone-13-venta-facturada");
  await ctx.close();

  // "Cerrar la app y volver a abrir": contexto nuevo, mismas URLs.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await ctx2.newPage();
  await p2.goto(saleUrl);
  await p2.getByText("QA-P-001 / QA-F-001").waitFor();
  await p2.getByText("$305,000").first().waitFor();
  await p2.getByText("Facturada").first().waitFor();
  await p2.goto(`${appUrl}?step=pdf`);
  await p2.getByText("Borradores generados").waitFor();
  if ((await p2.getByRole("link", { name: "Abrir" }).count()) < 1) fail("no persiste el borrador");
  log("reabierto: venta, factura y borrador persisten");
  await ctx2.close();

  // ─── 2) Capturas por viewport ───
  const VIEWPORTS = { "390x844": [390, 844], "430x932": [430, 932], "768x1024": [768, 1024], "1440x900": [1440, 900] };
  for (const [name, [w, h]] of Object.entries(VIEWPORTS)) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 800, hasTouch: w < 800 });
    const p = await c.newPage();
    for (const [route, label] of [["/", "inicio"], ["/customers", "clientes"], [customerUrl.replace(BASE, ""), "cliente"], [`${appUrl.replace(BASE, "")}?step=analisis`, "credito"], ["/sales", "ventas"], [saleUrl.replace(BASE, ""), "venta"], ["/alerts", "alertas"]]) {
      await p.goto(`${BASE}${route}`);
      await p.waitForLoadState("networkidle");
      await noHorizontalScroll(p, `${label}@${name}`);
      await shot(p, `vp-${name}-${label}`);
    }
    await c.close();
  }
  log(`OK — capturas en ${OUT}`);
} finally {
  await browser.close();
}
