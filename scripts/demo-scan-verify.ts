/**
 * CI (después del emulador): verifica la demo "escanear INE → observado → confirmar → solicitud".
 *  - Reconstruye la observación REAL de ML Kit (credencial sintética) desde logcat.
 *  - La pasa por IneParser y reporta qué se leyó.
 *  - Descarga el PDF BBVA generado dentro de la APK y comprueba que lleva los datos confirmados.
 * Escribe demo/REPORT.md. Sale con código 1 si algo no cuadra.
 *
 *   npx tsx scripts/demo-scan-verify.ts demo http://localhost:3000
 */
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { parseIne } from "../src/server/extraction/ine";
import { parseObservation } from "../src/server/extraction/observation";

const [dir = "demo", server = "http://localhost:3000"] = process.argv.slice(2);
const log = fs.readFileSync(path.join(dir, "logcat.txt"), "utf8");
const report: string[] = ["# Demo escáner INE (CI, emulador Android)", ""];
let ok = true;
const check = (cond: boolean, msg: string) => {
  report.push(`- ${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) ok = false;
};

// 1) Observación real de ML Kit
const chunks = new Map<number, string>();
let total = 0;
for (const m of log.matchAll(/SOFIA_OCR\s*:\s*CHUNK (\d+)\/(\d+) (\S+)/g)) {
  chunks.set(Number(m[1]), m[3]!);
  total = Number(m[2]);
}
check(total > 0 && chunks.size === total, `Observación de ML Kit recibida (${chunks.size}/${total} partes)`);
if (total > 0 && chunks.size === total) {
  const json = Buffer.from([...Array(total).keys()].map((i) => chunks.get(i + 1)!).join(""), "base64").toString("utf8");
  fs.writeFileSync(path.join(dir, "mlkit-ine-sintetica.json"), JSON.stringify(JSON.parse(json), null, 1));
  const obs = parseObservation(JSON.parse(json));
  check(Boolean(obs), "La observación cumple el esquema del servidor");
  if (obs) {
    const lines = obs.pages.reduce((n, p) => n + p.blocks.reduce((k, b) => k + b.lines.length, 0), 0);
    report.push(`- ML Kit: ${obs.pages.length} página(s), ${obs.pages.reduce((n, p) => n + p.blocks.length, 0)} bloques, ${lines} renglones`);
    const r = parseIne(obs, { docTypeIsIne: true });
    report.push("", "## IneParser sobre el OCR real de ML Kit", "", "| Campo | Valor (sintético) | Confianza |", "|---|---|---|");
    for (const f of r.fields) report.push(`| ${f.key} | ${f.value} | ${f.confidence} |`);
    if (r.warnings.length) report.push("", ...r.warnings.map((w) => `> ⚠️ ${w}`));
    report.push("");
    check(!r.fields.some((f) => f.confidence === "high"), "Ningún dato en confianza alta");
    check(!r.fields.some((f) => /name/.test(f.key) && /\d/.test(f.value)), "Ningún nombre con dígitos");
    const curp = r.fields.find((f) => f.key === "curp")?.value;
    check(curp === undefined || curp === "SIEP850505MDFNJR09", curp ? "CURP leída y validada" : "CURP dudosa en el OCR → se dejó vacía (nunca una CURP incorrecta)");
    const expected: Record<string, string> = { paternal_last_name: "SINTETICO", maternal_last_name: "EJEMPLO", first_name: "PRUEBA", birth_date: "1985-05-05", gender: "female", postal_code: "06000", state: "Ciudad de México" };
    const wrong = r.fields.filter((f) => expected[f.key] !== undefined && expected[f.key] !== f.value);
    check(wrong.length === 0, `Ningún dato con valor incorrecto${wrong.length ? `: ${wrong.map((f) => f.key).join(", ")}` : ""}`);
  }
}

// 2) Resultado del flujo dentro de la APK
const res = log.match(/SOFIA_DEMO\s*:\s*RESULT doc=(\S+) app=(\S+) generated=(\S+) observed=(\d+) confirmed=(\d+)/);
check(Boolean(res), "Flujo dentro de la APK: Escanear → revisión → confirmar → solicitud → PDF");
if (res) {
  const [, doc, app, gen, observed, confirmed] = res;
  report.push(`- Documento ${doc} · ${observed} dato(s) OBSERVADOS → ${confirmed} CONFIRMADOS por la prueba · solicitud ${app}`);
  const pdfRes = await fetch(`${server}/api/documents/generated/${gen}`);
  check(pdfRes.ok, "PDF de la solicitud descargado del servidor");
  if (pdfRes.ok) {
    const bytes = new Uint8Array(await pdfRes.arrayBuffer());
    fs.writeFileSync(path.join(dir, "solicitud-bbva-sintetica.pdf"), bytes);
    const form = (await PDFDocument.load(bytes)).getForm();
    const get = (n: string) => (form.getField(n) as PDFTextField).getText() ?? "";
    check(get("curp") === "SIEP850505MDFNJR09" || get("curp") === "", `PDF BBVA · CURP = "${get("curp")}" (correcta o vacía, nunca incorrecta)`);
    check(get("Apellido paterno") === "SINTETICO", `PDF BBVA · Apellido paterno = "${get("Apellido paterno")}"`);
    check(get("primer nombre") === "PRUEBA", `PDF BBVA · primer nombre = "${get("primer nombre")}"`);
  }
}

// 3) Funciones de la tablet
report.push("", "## Funciones de la tablet (en la APK)", "");
check(/SOFIA_DEMO\s*:\s*ALARM shown=true/.test(log), "Alarma de prueba mostrada por Android (notificación local)");
check(/SOFIA_DEMO\s*:\s*REMINDERS pending=/.test(log), "Recordatorio del servidor programado en Android (LocalNotifications.getPending)");

const photo = log.match(/SOFIA_DEMO\s*:\s*PHOTO doc=(\S+) app=(\S+) generated=(\S+) observed=(\d+)/);
check(Boolean(photo), "INE por FOTO (OCR real en la tablet) → observados → confirmar todos → solicitud → PDF");
if (photo) {
  const [, , app2, gen2, obs2] = photo;
  report.push(`- Foto INE: ${obs2} dato(s) observados · solicitud ${app2}`);
  const r = await fetch(`${server}/api/documents/generated/${gen2}`);
  if (r.ok) {
    const bytes = new Uint8Array(await r.arrayBuffer());
    fs.writeFileSync(path.join(dir, "solicitud-bbva-desde-foto.pdf"), bytes);
    const form = (await PDFDocument.load(bytes)).getForm();
    const get = (n: string) => (form.getField(n) as PDFTextField).getText() ?? "";
    check(get("Apellido paterno") === "SINTETICO" && get("primer nombre") === "PRUEBA", `PDF desde foto · ${get("Apellido paterno")} / ${get("primer nombre")}`);
    check(get("curp") === "SIEP850505MDFNJR09" || get("curp") === "", `PDF desde foto · CURP = "${get("curp")}" (correcta o vacía)`);
  } else check(false, "PDF desde foto descargado");
}

const mail = log.match(/SOFIA_DEMO\s*:\s*EMAIL id=(\S+) to=(\S+)/);
check(Boolean(mail), "Correo de placas enviado desde la APK (con confirmación)");
const smtpDir = path.join(dir, "smtp");
const emls = fs.existsSync(smtpDir) ? fs.readdirSync(smtpDir).map((f) => fs.readFileSync(path.join(smtpDir, f), "utf8")) : [];
const platesMail = emls.find((m) => /To: gestor\.placas@example\.com/.test(m));
check(Boolean(platesMail), `El servidor SMTP recibió el correo de placas (${emls.length} correo(s) recibidos)`);
if (platesMail) check(/filename="?INE\.jpg"?/.test(platesMail) && /Content-Type: image\/jpeg/.test(platesMail), "El correo de placas lleva la INE adjunta");

report.push("", "Capturas de pantalla (APK en el emulador): `screens/`.", "Única sustitución: la pantalla de cámara del escáner de Google Play (no operable en emulador) entrega la imagen sintética; el OCR es ML Kit real en el dispositivo.");
fs.writeFileSync(path.join(dir, "REPORT.md"), report.join("\n") + "\n");
console.log(report.join("\n"));
process.exit(ok ? 0 : 1);
