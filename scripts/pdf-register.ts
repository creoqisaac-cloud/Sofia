/**
 * Registra el PDF ORIGINAL de una financiera como plantilla (se guarda intacto en
 * almacenamiento privado, fuera de git). Detén la app antes (PGlite local).
 *
 *   npm run pdf:register -- --institution BBVA --file solicitud.pdf --version 2026-09 [--mapping mapeo.json] [--clear-values]
 *
 * Si el PDF trae valores capturados (p. ej. una solicitud ya llenada de un cliente),
 * se rechaza salvo `--clear-values`, que registra una copia con todos los campos vacíos.
 */
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { clearField, fieldHasValue } from "../src/server/credit/pdf";
import { createAppContext, createHandleFromConfig } from "../src/server/app";
import { loadConfig } from "../src/server/config";
import { DemoProvider } from "../src/server/agent/providers/demo";
import { LocalPrivateStorage } from "../src/server/storage/documents";
import { registerTemplate } from "../src/server/services/credit";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const institution = arg("institution");
const file = arg("file");
if (!institution || !file) {
  console.error("Uso: npm run pdf:register -- --institution BBVA --file archivo.pdf --version v1 [--mapping mapeo.json] [--clear-values]");
  process.exit(1);
}
let bytes: Uint8Array = new Uint8Array(fs.readFileSync(file));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
const form = doc.getForm();
// Incluye casillas de varias opciones con un widget encendido (el BBVA "vacío" trae una respuesta PEP marcada).
const withValues = form.getFields().filter((f) => fieldHasValue(f));
if (withValues.length) {
  if (!args.includes("--clear-values")) {
    console.error(`El PDF tiene ${withValues.length} campos con valores (posible PII). Usa --clear-values para registrar una copia en blanco.`);
    process.exit(1);
  }
  for (const f of form.getFields()) clearField(f);
  bytes = await doc.save();
}
const mapping = arg("mapping") ? (JSON.parse(fs.readFileSync(arg("mapping")!, "utf8")) as Record<string, string>) : undefined;
const config = loadConfig();
const app = await createAppContext({ handle: createHandleFromConfig(config), provider: new DemoProvider(), migrate: true, seed: false, storage: new LocalPrivateStorage(config.SOFIA_PRIVATE_STORAGE_DIR) });
const res = await registerTemplate(app, { institutionCode: institution, name: `${institution.toUpperCase()} — ${path.basename(file)}`, version: arg("version") ?? "sin-version", bytes, fileName: path.basename(file), fieldMapping: mapping });
console.log(`Plantilla registrada: ${res.template.id} · campos PDF: ${res.pdfFields} · slots mapeados: ${res.mappedSlots}`);
console.log(`Slots sin mapear (${res.unmappedSlots.length}): ${res.unmappedSlots.join(", ")}`);
await app.close();
