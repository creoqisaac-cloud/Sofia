/**
 * Genera el ícono y el splash de Sofía para Android (mismos tamaños que Capacitor).
 *   node scripts/android-assets.mjs
 * Renderiza con Chromium (Playwright); no requiere herramientas externas.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const RES = "android/app/src/main/res";
const INK = "#0a0a0b";
const SAND = "#e7d3ae";
const pngSize = (file) => {
  const b = fs.readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

const glyph = (px, color = SAND) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${px}" height="${px}">
    <text x="50" y="69" text-anchor="middle" font-family="Georgia, 'DejaVu Serif', serif" font-size="64" font-weight="600" fill="${color}">S</text>
    <circle cx="74" cy="28" r="4.2" fill="${color}"/>
  </svg>`;

const pages = {
  icon: (w) => `<body style="margin:0;background:${INK};width:${w}px;height:${w}px;display:flex;align-items:center;justify-content:center">${glyph(w * 0.8)}</body>`,
  round: (w) => `<body style="margin:0;background:transparent;width:${w}px;height:${w}px"><div style="width:${w}px;height:${w}px;border-radius:50%;background:${INK};display:flex;align-items:center;justify-content:center">${glyph(w * 0.78)}</div></body>`,
  foreground: (w) => `<body style="margin:0;background:transparent;width:${w}px;height:${w}px;display:flex;align-items:center;justify-content:center">${glyph(w * 0.56)}</body>`,
  splash: (w, h) => `<body style="margin:0;background:${INK};width:${w}px;height:${h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif">
      ${glyph(Math.min(w, h) * 0.22)}
      <div style="color:${SAND};letter-spacing:0.4em;font-weight:600;font-size:${Math.round(Math.min(w, h) * 0.045)}px;margin-top:${Math.round(Math.min(w, h) * 0.02)}px;padding-left:0.4em">SOFÍA</div>
    </body>`,
};

const browser = await chromium.launch();
const page = await browser.newPage();
let n = 0;
for (const dir of fs.readdirSync(RES)) {
  for (const file of fs.readdirSync(path.join(RES, dir))) {
    if (!file.endsWith(".png")) continue;
    const full = path.join(RES, dir, file);
    const [w, h] = pngSize(full);
    const kind = file.startsWith("splash") ? "splash" : file.includes("round") ? "round" : file.includes("foreground") ? "foreground" : "icon";
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><head><style>html{background:transparent}</style></head>${pages[kind](w, h)}</html>`);
    await page.screenshot({ path: full, omitBackground: kind !== "icon" && kind !== "splash", clip: { x: 0, y: 0, width: w, height: h } });
    n++;
  }
}
await browser.close();
fs.writeFileSync(`${RES}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${INK}</color>\n</resources>\n`);
console.log(`${n} imágenes generadas`);
