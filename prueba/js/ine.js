// Análisis de INE: lectura (OCR por etiquetas y/o IA con visión) + validaciones oficiales de estructura
// (CURP con dígito verificador, clave de elector, reverso MRZ, CP ↔ estado, vigencia, mayoría de edad).
// Cuando hay dos lecturas (OCR e IA) se comparan campo por campo: lo que no coincide se marca.
import { parseIne } from "./ine-parser.js";
import { isValidCurp, curpBirthDate, curpSex, curpMatchesName, isValidVoterKey, stateForPostalCode } from "./mxid.js";
import { pageLines } from "./ocr-obs.js";

// Clave del lector → clave de la solicitud (las mismas del formato oficial del banco)
const MAP = {
  first_name: "first_name", middle_name: "middle_name", paternal_last_name: "paternal_last_name", maternal_last_name: "maternal_last_name",
  curp: "curp", voter_key: "voter_key", birth_date: "birth_date", gender: "gender",
  street: "street", exterior_number: "exterior_number", interior_number: "interior_number", neighborhood: "neighborhood",
  postal_code: "postal_code", municipality: "municipality", state: "state",
};

/** Año de vigencia impreso ("VIGENCIA 2023 - 2033" → 2033). */
function readValidity(obs) {
  for (const p of obs.pages) {
    const lines = pageLines(p).map((l) => l.text.toUpperCase());
    for (let i = 0; i < lines.length; i++) {
      if (!/VIGENCIA/.test(lines[i])) continue;
      const years = [...[lines[i], lines[i + 1] ?? ""].join(" ").matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
      if (years.length) return Math.max(...years);
    }
  }
  return null;
}

export function ageFrom(iso, now = new Date()) {
  if (!iso) return null;
  const b = new Date(`${iso}T12:00:00`);
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

const LABEL = { first_name: "nombre", middle_name: "segundo nombre", paternal_last_name: "apellido paterno", maternal_last_name: "apellido materno", curp: "CURP", voter_key: "clave de elector", birth_date: "fecha de nacimiento", gender: "sexo", street: "calle", exterior_number: "número exterior", interior_number: "número interior", neighborhood: "colonia", postal_code: "código postal", municipality: "municipio", state: "estado", ine_validity: "vigencia" };
export const ineLabel = (k) => LABEL[k] ?? k;

const sexOf = (curp) => (curpSex(curp) === "female" ? "female" : "male");

/** Lectura por OCR (sin IA). Devuelve { detected, values, confidence, warnings }. */
export function readIne(obs) {
  const r = parseIne(obs, { docTypeIsIne: true });
  const values = {};
  const confidence = {};
  for (const f of r.fields) {
    const key = MAP[f.key];
    if (!key) continue;
    values[key] = f.value;
    confidence[key] = f.confidence;
  }
  const validity = readValidity(obs);
  if (validity) values.ine_validity = String(validity);
  let warnings = r.warnings;
  if (r.detected && !values.curp) {
    const tokens = obs.pages.flatMap((p) => pageLines(p).flatMap((l) => [...l.text.toUpperCase().replace(/^.*?CURP/, "").replace(/\s+/g, "").matchAll(/[A-Z0-9]{18}/g)].map((m) => m[0])));
    const fixed = repairCurp(tokens, values);
    if (fixed) {
      values.curp = fixed;
      confidence.curp = "low";
      warnings = warnings.filter((w) => !w.startsWith("La CURP leída"));
      warnings.push("La CURP traía letras y números confundidos (O/0, I/1…): se corrigió según el formato oficial y la fecha impresa. Revísala.");
    }
  }
  return { detected: r.detected, values, confidence, warnings, engine: "ocr" };
}

// Posiciones de la CURP: 0-3 letras · 4-9 fecha (dígitos) · 10-15 letras · 16 dígito (1900s) o letra (2000s) · 17 dígito
const TO_DIGIT = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", G: "6", B: "8" };
const TO_LETTER = { 0: "O", 1: "I", 2: "Z", 5: "S", 6: "G", 8: "B" };

/**
 * Corrige confusiones típicas (O/0, I/1…) SOLO donde el formato oficial obliga a dígito o letra, y solo
 * acepta el resultado si pasa el dígito verificador y coincide con la fecha impresa (y el sexo/nombre
 * si se leyeron). Sin fecha impresa no se corrige nada: no se inventan datos.
 */
function repairCurp(tokens, v) {
  if (!v.birth_date) return null;
  const century19 = Number(v.birth_date.slice(0, 4)) < 2000;
  for (const t of new Set(tokens)) {
    const fixed = [...t].map((ch, i) => {
      const digit = (i >= 4 && i <= 9) || i === 17 || (i === 16 && century19);
      return digit ? (TO_DIGIT[ch] ?? ch) : (TO_LETTER[ch] ?? ch);
    }).join("");
    if (!isValidCurp(fixed) || curpBirthDate(fixed) !== v.birth_date) continue;
    if (v.gender && sexOf(fixed) !== v.gender) continue;
    if (v.paternal_last_name && v.first_name && !curpMatchesName(fixed, { paternal: v.paternal_last_name, maternal: v.maternal_last_name || null, given: [v.first_name, v.middle_name].filter(Boolean).join(" ") })) continue;
    return fixed;
  }
  return null;
}

const up = (s) => String(s ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Convierte la lectura de la IA (ai.readIneWithAi) a datos de la solicitud y la VERIFICA. */
export function fromAiReading(r, ocr = null) {
  const [first, ...middle] = up(r.nombres).split(" ").filter(Boolean);
  const v = {
    first_name: first ?? "", middle_name: middle.join(" "), paternal_last_name: up(r.apellido_paterno), maternal_last_name: up(r.apellido_materno),
    birth_date: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha_nacimiento) ? r.fecha_nacimiento : "",
    gender: r.sexo === "M" ? "female" : r.sexo === "H" ? "male" : "",
    curp: up(r.curp).replace(/\s/g, ""), voter_key: up(r.clave_elector).replace(/\s/g, ""),
    street: up(r.calle), exterior_number: up(r.numero_exterior), interior_number: up(r.numero_interior), neighborhood: up(r.colonia),
    postal_code: String(r.codigo_postal ?? "").replace(/\D/g, ""), municipality: up(r.municipio), state: r.estado ?? "",
    ine_validity: (String(r.vigencia ?? "").match(/20\d{2}/g) ?? []).pop() ?? "",
  };
  for (const k of Object.keys(v)) if (!v[k]) delete v[k];
  const warnings = [];
  const confidence = {};
  if (v.curp && !isValidCurp(v.curp)) {
    const fixed = repairCurp([v.curp], v);
    if (fixed) { v.curp = fixed; warnings.push("La CURP leída tenía un carácter confundido; se corrigió con el formato oficial y la fecha. Revísala."); }
    else { warnings.push("La CURP leída no pasa el dígito verificador: revísala letra por letra."); confidence.curp = "low"; }
  }
  if (v.voter_key && !isValidVoterKey(v.voter_key)) { warnings.push("La clave de elector no tiene el formato oficial: revísala."); confidence.voter_key = "low"; }
  if (v.postal_code && v.state && stateForPostalCode(v.postal_code) && up(stateForPostalCode(v.postal_code)) !== up(v.state)) warnings.push("El código postal no corresponde al estado: revisa el domicilio.");
  for (const k of r.ilegibles ?? []) warnings.push(`No se leyó con certeza: ${k}.`);
  // Segunda opinión: el OCR del dispositivo. Coinciden → confianza alta; no coinciden → se marca.
  if (ocr?.detected) {
    const diff = [];
    for (const [k, val] of Object.entries(ocr.values)) {
      if (!v[k]) { v[k] = val; confidence[k] = ocr.confidence[k] ?? "low"; continue; }
      if (up(v[k]) === up(val)) confidence[k] ??= "high";
      else { diff.push(k); confidence[k] = "low"; }
    }
    if (diff.length) warnings.push(`La IA y el lector del teléfono no coinciden en: ${diff.map(ineLabel).join(", ")}. Revisa esos campos contra la credencial.`);
  }
  for (const k of Object.keys(v)) confidence[k] ??= "medium";
  return { detected: r.es_ine !== false, values: v, confidence, warnings, engine: ocr?.detected ? "ia+ocr" : "ia" };
}

/** Revisión de los datos capturados (vengan de la INE o a mano). */
export function checkIdentity(v, now = new Date()) {
  const checks = [];
  const add = (ok, text) => checks.push({ ok, text });
  const curp = String(v.curp ?? "").toUpperCase().trim();
  if (!curp) add(null, "Falta la CURP.");
  else if (!isValidCurp(curp)) add(false, "La CURP no es válida (estructura o dígito verificador). Revísala letra por letra.");
  else {
    add(true, "CURP válida (estructura y dígito verificador).");
    const b = curpBirthDate(curp);
    if (v.birth_date && b && b !== v.birth_date) add(false, "La fecha de nacimiento no coincide con la CURP.");
    if (v.gender && v.gender !== sexOf(curp)) add(false, "El sexo no coincide con la CURP.");
    if (v.paternal_last_name && v.first_name && !curpMatchesName(curp, { paternal: up(v.paternal_last_name), maternal: up(v.maternal_last_name) || null, given: up([v.first_name, v.middle_name].filter(Boolean).join(" ")) })) add(false, "El nombre no coincide con las iniciales de la CURP: revisa el orden de apellidos.");
  }
  if (v.rfc && curp && isValidCurp(curp) && up(v.rfc).slice(0, 10) !== curp.slice(0, 10)) add(false, "Los primeros 10 caracteres del RFC no coinciden con la CURP.");
  const birth = v.birth_date || (isValidCurp(curp) ? curpBirthDate(curp) : null);
  const age = ageFrom(birth, now);
  if (age === null) add(null, "Falta la fecha de nacimiento.");
  else if (age < 18) add(false, `Menor de edad (${age} años).`);
  else if (age > 75) add(false, `Edad ${age} años: revisa la política de edad máxima del banco.`);
  else add(true, `Edad: ${age} años.`);
  const year = Number(v.ine_validity);
  if (!v.ine_validity) add(null, "Falta la vigencia de la INE.");
  else if (!Number.isFinite(year)) add(false, "La vigencia de la INE no es un año.");
  else if (year < now.getFullYear()) add(false, `INE vencida (vigencia ${year}).`);
  else add(true, `INE vigente hasta ${year}.`);
  return { checks, age };
}
