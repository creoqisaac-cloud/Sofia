/**
 * Verifica el mapeo contra los PDF REALES (uso local; los PDF nunca se versionan).
 *
 *   npm run pdf:compare -- --institution BBVA --blank vacio.pdf [--filled lleno.pdf] [--out private/prueba.pdf]
 *
 * - Confirma que el PDF vacío es la versión conocida (todos los campos del mapeo existen).
 * - Lista campos del PDF que Sofía NO llena (manuales) — solo NOMBRES.
 * - Llena una copia con un perfil SINTÉTICO (DEMO) para revisar visualmente la colocación.
 * - Con --filled: compara vacío vs lleno y muestra qué datos se importarían (solo CLAVES, nunca valores).
 */
import fs from "node:fs";
import path from "node:path";
import { analyzeApplication, buildFillPlan, getAdapter, type FieldStates } from "../src/domain/credit";
import { extractProfileEntries } from "../src/server/credit/import";
import { fillPdf, inspectPdfFields, matchesRealMapping, realMapping, splitFieldRef } from "../src/server/credit/pdf";

const args = process.argv.slice(2);
const arg = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const institution = arg("institution");
const blank = arg("blank");
if (!institution || !blank) {
  console.error("Uso: npm run pdf:compare -- --institution BBVA|BANORTE --blank vacio.pdf [--filled lleno.pdf] [--out private/x.pdf]");
  process.exit(1);
}
const adapter = getAdapter(institution);
if (!adapter) throw new Error(`Sin adaptador para ${institution}`);
const blankBytes = new Uint8Array(fs.readFileSync(blank));
const fields = await inspectPdfFields(blankBytes);
const mapping = realMapping(adapter);
const usedBases = new Set(Object.values(mapping).map((r) => splitFieldRef(r).base));
console.log(`${adapter.institutionName}: ${fields.length} campos AcroForm · versión conocida: ${matchesRealMapping(adapter, fields) ? "SÍ" : "NO (revisar mapeo)"}`);
const byClass = (c: string) => adapter.slots.filter((s) => s.class === c).length;
console.log(`Slots: ${adapter.slots.length} (AUTO_FILL ${byClass("AUTO_FILL")}, ASK_IF_MISSING ${byClass("ASK_IF_MISSING")}, CONDITIONAL ${byClass("CONDITIONAL")}, HUMAN ${byClass("HUMAN_CONFIRMATION")}, SIGNATURE ${byClass("SIGNATURE")})`);
const manual = fields.filter((f) => !usedBases.has(f.name)).map((f) => `${f.name} [${f.type}]`);
console.log(`Campos sin mapeo (los llena Mario / el cliente a mano): ${manual.length}`);
for (const m of manual) console.log(`  · ${m}`);

// Perfil sintético (DEMO) para verificar el llenado sobre el PDF real.
const demo: Record<string, string | number> = {
  first_name: "DEMO", middle_name: "PRUEBA", paternal_last_name: "SINTETICO", maternal_last_name: "EJEMPLO", birth_date: "1990-01-15", birth_city: "CIUDAD DEMO", birth_state: "ESTADO DEMO", birth_country: "MEXICO",
  nationality: "Mexicana", gender: "male", marital_status: "married_joint", dependents: 2, rfc: "DEMO900115AB1", curp: "DEMO900115HDFXXX01", nss: "00000000000", profession: "INGENIERO", education_level: "bachelor",
  mobile_phone: "5550000001", home_phone: "5550000002", email: "demo@example.com", street: "CALLE DEMO", exterior_number: "100", neighborhood: "COLONIA DEMO", municipality: "MUNICIPIO DEMO", city: "CIUDAD DEMO", state: "ESTADO DEMO", postal_code: "01000",
  housing_status: "owned", residence_years: 5, residence_months: 0, company_name: "EMPRESA DEMO SA", company_activity: "SERVICIOS", company_type: "private", employment_status: "employed", job_title: "GERENTE", monthly_fixed_income: 45000, monthly_variable_income: 5000,
  employment_years: 6, employment_months: 0, work_phone: "5550001000", work_extension: "123", work_street: "AV DEMO", work_exterior_number: "500", work_neighborhood: "COLONIA LABORAL", work_municipality: "MUNICIPIO DEMO", work_city: "CIUDAD DEMO", work_state: "ESTADO DEMO", work_postal_code: "02000",
  reference_1_name: "REFERENCIA FAMILIAR DEMO", reference_1_phone: "5550002001", reference_1_address: "CALLE REF 1", reference_2_name: "REFERENCIA PERSONAL DEMO", reference_2_phone: "5550002002", reference_2_address: "CALLE REF 2",
};
const states: FieldStates = Object.fromEntries(Object.entries(demo).map(([k, v]) => [k, { status: "confirmed" as const, value: v, factId: k, sourceLabel: "DEMO" }]));
const analysis = analyzeApplication(adapter, states);
const plan = buildFillPlan(analysis, mapping);
const res = await fillPdf(blankBytes, plan.fill, { title: "PRUEBA DEMO" });
console.log(`Llenado DEMO: ${res.filled.length} campos · no encontrados en el PDF: ${res.missingInPdf.length}${res.missingInPdf.length ? ` (${res.missingInPdf.join(", ")})` : ""}`);
const out = arg("out");
if (out) {
  if (!/^(private|archivos-reales)\//.test(out)) throw new Error("Guarda la salida solo en private/ o archivos-reales/ (ignorados por git).");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, res.bytes);
  console.log(`Copia DEMO: ${out}`);
}

const filled = arg("filled");
if (filled) {
  const bytes = new Uint8Array(fs.readFileSync(filled));
  const { PDFDocument, PDFTextField, PDFCheckBox } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const withValue = doc
    .getForm()
    .getFields()
    .filter((f) => (f instanceof PDFTextField && (f.getText() ?? "").trim()) || (f instanceof PDFCheckBox && f.isChecked()))
    .map((f) => f.getName());
  const unmappedFilled = withValue.filter((n) => !usedBases.has(n));
  console.log(`\nLleno vs vacío: ${withValue.length} campos con valor · mapeados ${withValue.length - unmappedFilled.length} · sin mapeo ${unmappedFilled.length}${unmappedFilled.length ? ` (${unmappedFilled.join(", ")})` : ""}`);
  const { entries, skipped } = await extractProfileEntries(bytes, adapter, mapping);
  console.log(`Se importarían ${entries.length} datos (solo claves): ${[...new Set(entries.map((e) => e.key))].join(", ")}`);
  if (skipped.length) console.log(`No se importan a ciegas (compuestos/ambiguos): ${skipped.join(", ")}`);
}
