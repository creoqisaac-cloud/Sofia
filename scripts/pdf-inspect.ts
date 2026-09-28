/**
 * Inspecciona un PDF AcroForm: lista NOMBRES y TIPOS de campo (nunca valores, que
 * pueden contener PII) y, si se indica financiera, sugiere el mapeo slot → campo.
 *
 *   npm run pdf:inspect -- ruta/solicitud.pdf [BBVA|BANORTE]
 */
import fs from "node:fs";
import { getAdapter } from "../src/domain/credit";
import { inspectPdfFields, suggestMapping } from "../src/server/credit/pdf";

const [file, institution] = process.argv.slice(2);
if (!file) {
  console.error("Uso: npm run pdf:inspect -- archivo.pdf [BBVA|BANORTE]");
  process.exit(1);
}
const fields = await inspectPdfFields(new Uint8Array(fs.readFileSync(file)));
console.log(`Campos AcroForm: ${fields.length}`);
for (const f of fields) console.log(`  [${f.type}] ${f.name}`);
if (institution) {
  const adapter = getAdapter(institution);
  if (!adapter) throw new Error(`Sin adaptador para ${institution}`);
  const mapping = suggestMapping(adapter, fields);
  const unmapped = adapter.slots.filter((s) => !mapping[s.slot]);
  console.log(`\nMapeo sugerido (${Object.keys(mapping).length}/${adapter.slots.length} slots). REVISAR antes de usar:`);
  console.log(JSON.stringify(mapping, null, 2));
  console.log(`\nSlots sin campo sugerido (${unmapped.length}):`);
  for (const s of unmapped) console.log(`  ${s.slot} — ${s.label} [${s.class}]`);
}
