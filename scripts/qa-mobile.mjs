/**
 * QA móvil con Playwright contra una app en ejecución (datos DEMO).
 *
 *   BASE_URL=http://localhost:3000 npm run qa:mobile
 *
 * 1) Recorre la demo guiada de Sprint 3 en iPhone (390×844):
 *    HOY → cotización por comando → "¿qué le falta a Juan?" → agendar (con confirmación) →
 *    correo de placas (borrador, nunca se envía) → ventas → ficha del cliente → PDF BBVA real-mapeado.
 * 2) Capturas por viewport (390×844, 430×932, 768×1024, 1440×900), sin scroll horizontal
 *    ni inputs < 16 px. Las capturas quedan en qa-screenshots/ (ignorado por git).
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
const shot = (page, name, fullPage = false) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });

async function noHorizontalScroll(page, where) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) fail(`scroll horizontal de ${overflow}px en ${where}`);
}
async function smallInputs(page, where) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("input:not([type=hidden]):not([type=file]):not([type=checkbox]), select, textarea")]
      .filter((el) => el.offsetParent !== null && parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => el.getAttribute("name") ?? el.getAttribute("aria-label") ?? el.tagName),
  );
  if (small.length) fail(`inputs < 16px (zoom en iOS) en ${where}: ${small.join(", ")}`);
}
async function command(page, text) {
  const input = page.locator('input[aria-label="Comando para Sofía"]').first();
  await input.fill(text);
  await input.press("Enter");
}

// Campos del PDF real que NUNCA debe llenar Sofía (PEP, terceros, firmas).
const NEVER = [/^Firma/, /^pep$/, /^rel pep$/, /^relacion pep$/, /^funcion/, /^tercero$/, /^Especifica$/, /PEP/];

const browser = await chromium.launch(launchOpts);
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-MX" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(`error de página: ${e.message}`));

  // Escena 1 — HOY con pendientes reales
  await page.goto(`${BASE}/`);
  await page.getByText("¿Qué necesitas, Mario?").waitFor();
  const hoy = await page.locator("section ul > li").count();
  if (hoy < 3) fail(`HOY muestra ${hoy} pendientes`);
  await noHorizontalScroll(page, "inicio");
  await smallInputs(page, "inicio");
  await shot(page, "s3-01-inicio");
  log(`escena 1: HOY con ${hoy} pendientes`);

  // Micrófono: sin permiso/HTTPS no rompe la app (respaldo de texto)
  await page.getByRole("button", { name: "Hablar con Sofía" }).click();
  await page.waitForTimeout(600);

  // Escena 2 — cotización por comando
  await command(page, "Cotízame una HR-V Touring con 150 mil de enganche a 48 meses");
  await page.getByText("Mensualidad · 48 meses").waitFor();
  await page.getByText(/Corrida exacta/).waitFor();
  await shot(page, "s3-02-cotizacion");
  await command(page, "cotiza una CR-V Turbo Plus con 200 mil a 36 meses");
  await page.getByText("Falta información para reproducir esta cotización exactamente.").waitFor();
  await shot(page, "s3-02b-cotizacion-falta");
  log("escena 2: cotización exacta (DEMO) y caso incompleto sin inventar");

  // Escena 3 — ¿qué le falta a Juan?
  await command(page, "¿Qué le falta a Juan?");
  await page.getByText(/Venta: /).first().waitFor();
  await shot(page, "s3-03-que-le-falta");

  // Escena 4 — agendar con confirmación
  await command(page, "Agenda a Juan mañana a las cinco");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await page.getByText(/Cita agendada/).waitFor();
  await shot(page, "s3-04-cita");
  log("escena 4: cita agendada tras confirmar");

  // Escena 5 — correo de placas (borrador)
  await command(page, "Prepara el correo de placas de Juan");
  await page.getByText("Borrador · no se envía sin tu confirmación").waitFor();
  await shot(page, "s3-05-correo", true);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await page.getByRole("button", { name: "Sí, enviar" }).click();
  await page.getByText(/Falta configurar la cuenta de correo/).first().waitFor();
  log("escena 5: borrador listo; enviar explica que falta la cuenta (no se envió nada)");

  // Escena 6 — ventas
  await page.getByRole("link", { name: "Ventas" }).last().click();
  await page.getByText(/Pedido DEMO-P-0005/).waitFor();
  await shot(page, "s3-06-ventas");

  // Agenda y ficha del cliente
  await page.goto(`${BASE}/agenda`);
  await page.getByRole("heading", { name: "SEGUIMIENTO" }).waitFor();
  await shot(page, "s3-07-agenda", true);
  await page.goto(`${BASE}/customers`);
  await page.getByText("Juan Pérez (DEMO)").first().click();
  await page.getByText("SIGUIENTE ACCIÓN", { exact: true }).waitFor();
  const customerUrl = page.url().split("?")[0];
  await shot(page, "s3-08-cliente", true);

  // Solicitud BBVA → borrador con el mapeo del PDF real (plantilla DEMO con los mismos nombres de campo)
  await page.goto(`${customerUrl}/credit`);
  await page.getByRole("button", { name: "BBVA" }).click();
  await page.waitForURL(/\/credit\/[0-9a-f-]{36}/);
  const appUrl = page.url().split("?")[0];
  await page.goto(`${appUrl}?step=pdf`);
  await page.getByRole("button", { name: "Generar borrador PDF" }).click();
  const open = page.getByRole("link", { name: "Abrir borrador PDF" });
  await open.waitFor();
  const res = await ctx.request.get(new URL(await open.getAttribute("href"), BASE).toString());
  const pdf = await PDFDocument.load(await res.body());
  let filled = 0;
  for (const f of pdf.getForm().getFields()) {
    const n = f.getName();
    const has = (f instanceof PDFTextField && (f.getText() ?? "").trim()) || (f instanceof PDFCheckBox && f.isChecked());
    if (has) filled++;
    if (has && NEVER.some((re) => re.test(n))) fail(`campo humano/firma llenado: ${n}`);
  }
  await shot(page, "s3-09-pdf");
  log(`PDF BBVA: ${filled} campos llenados; PEP/terceros/firmas vacíos`);
  await ctx.close();

  // Reabrir: la cita y la venta persisten
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/agenda`);
  await p2.getByText("Juan Pérez").first().waitFor();
  await ctx2.close();
  log("reabierto: la cita persiste");

  // Capturas por viewport
  const VIEWPORTS = { "390x844": [390, 844], "430x932": [430, 932], "768x1024": [768, 1024], "1440x900": [1440, 900] };
  for (const [name, [w, h]] of Object.entries(VIEWPORTS)) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 800, hasTouch: w < 800 });
    const p = await c.newPage();
    for (const [route, label] of [["/", "inicio"], ["/quote", "cotizar"], ["/customers", "clientes"], [customerUrl.replace(BASE, ""), "cliente"], ["/agenda", "agenda"], ["/sales", "ventas"], ["/plates", "placas"], ["/more", "mas"]]) {
      await p.goto(`${BASE}${route}`);
      await p.waitForLoadState("networkidle");
      await noHorizontalScroll(p, `${label}@${name}`);
      await smallInputs(p, `${label}@${name}`);
      await p.screenshot({ path: path.join(OUT, `vp-${name}-${label}.png`) });
    }
    await c.close();
  }
  log(`OK — capturas en ${OUT}`);
} finally {
  await browser.close();
}
