/**
 * Genera una credencial INE SINTÉTICA (persona inexistente, marcada "MUESTRA") para probar el OCR
 * real de ML Kit en Android y el flujo de escaneo. Nunca usar credenciales reales como fixtures.
 *
 *   node scripts/ine-sintetica.mjs  → android/app/src/androidTest/assets/ine-sintetica-{frente,reverso}.png
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const DICT = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
const curpDigit = (c17) => (10 - ([...c17].reduce((s, ch, i) => s + DICT.indexOf(ch) * (18 - i), 0) % 10)) % 10;
const mrzCheck = (s) => [...s].reduce((sum, c, i) => sum + (c === "<" ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55) * [7, 3, 1][i % 3], 0) % 10;

// Mismos datos ficticios que tests/fixtures/ine.ts
const CURP17 = "SIEP850505MDFNJR0";
const D = {
  paternal: "SINTETICO",
  maternal: "EJEMPLO",
  given: "PRUEBA ANA",
  curp: CURP17 + curpDigit(CURP17),
  voterKey: "SNEJPR85050509M100",
  birth: "05/05/1985",
  sex: "M",
  street: "C FALSA 123 INT 4",
  colonia: "COL CENTRO 06000",
  munState: "CUAUHTEMOC, CDMX.",
};
const l2body = `850505${mrzCheck("850505")}F331231${mrzCheck("331231")}MEX<<<<<<<<<<<0`;
const MRZ = ["IDMEX1234567890<<0000000000000", l2body, "SINTETICO<EJEMPLO<<PRUEBA<ANA".padEnd(30, "<")];

const css = `
  * { margin: 0; box-sizing: border-box; }
  body { width: 1012px; height: 638px; font-family: Arial, Helvetica, "Liberation Sans", sans-serif; background: #fff; }
  .card { position: relative; width: 1012px; height: 638px; background: linear-gradient(135deg, #f3efe6, #e3ecef); color: #111; overflow: hidden; }
  .abs { position: absolute; }
  .lbl { font-size: 15px; color: #5a5a5a; letter-spacing: .5px; }
  .val { font-size: 25px; font-weight: 700; line-height: 30px; }
  .hdr { font-size: 22px; font-weight: 700; }
  .muestra { font-size: 13px; color: #b3261e; font-weight: 700; }
  .mrz { font-family: "Courier New", "Liberation Mono", monospace; font-size: 38px; letter-spacing: 3px; font-weight: 700; }
`;

const front = `
<div class="card">
  <div class="abs hdr" style="left:300px;top:24px">INSTITUTO NACIONAL ELECTORAL</div>
  <div class="abs hdr" style="left:300px;top:56px;font-size:18px">CREDENCIAL PARA VOTAR</div>
  <div class="abs" style="left:34px;top:120px;width:236px;height:300px;background:#c9c9c9;border-radius:8px"></div>
  <div class="abs lbl" style="left:300px;top:118px">NOMBRE</div>
  <div class="abs val" style="left:300px;top:142px">${D.paternal}<br>${D.maternal}<br>${D.given}</div>
  <div class="abs lbl" style="left:800px;top:118px">SEXO</div>
  <div class="abs val" style="left:860px;top:111px">${D.sex}</div>
  <div class="abs lbl" style="left:300px;top:250px">DOMICILIO</div>
  <div class="abs val" style="left:300px;top:274px">${D.street}<br>${D.colonia}<br>${D.munState}</div>
  <div class="abs lbl" style="left:300px;top:382px">CLAVE DE ELECTOR</div>
  <div class="abs val" style="left:470px;top:376px">${D.voterKey}</div>
  <div class="abs lbl" style="left:300px;top:422px">CURP</div>
  <div class="abs val" style="left:360px;top:416px">${D.curp}</div>
  <div class="abs lbl" style="left:300px;top:462px">FECHA DE NACIMIENTO</div>
  <div class="abs val" style="left:300px;top:484px">${D.birth}</div>
  <div class="abs lbl" style="left:640px;top:462px">AÑO DE REGISTRO</div>
  <div class="abs val" style="left:640px;top:484px">2003 01</div>
  <div class="abs lbl" style="left:300px;top:540px">SECCIÓN</div>
  <div class="abs val" style="left:390px;top:534px">0001</div>
  <div class="abs lbl" style="left:640px;top:540px">VIGENCIA</div>
  <div class="abs val" style="left:735px;top:534px">2023 - 2033</div>
  <div class="abs muestra" style="left:34px;top:604px">MUESTRA SINTETICA · PERSONA INEXISTENTE · SIN VALIDEZ</div>
</div>`;

const back = `
<div class="card">
  <div class="abs muestra" style="left:34px;top:24px">MUESTRA SINTETICA · PERSONA INEXISTENTE · SIN VALIDEZ</div>
  <div class="abs" style="left:34px;top:70px;width:300px;height:300px;background:repeating-linear-gradient(90deg,#222 0 6px,#fff 6px 12px)"></div>
  <div class="abs mrz" style="left:40px;top:450px;line-height:54px">${MRZ.map((l) => l.replace(/</g, "&lt;")).join("<br>")}</div>
</div>`;

const out = path.resolve("android/app/src/androidTest/assets");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1012, height: 638 }, deviceScaleFactor: 2 });
for (const [name, html] of [["frente", front], ["reverso", back]]) {
  await page.setContent(`<style>${css}</style>${html}`);
  await page.screenshot({ path: path.join(out, `ine-sintetica-${name}.png`) });
}
await browser.close();
console.log(`CURP sintética: ${D.curp}\nMRZ:\n${MRZ.join("\n")}\n→ ${out}`);
