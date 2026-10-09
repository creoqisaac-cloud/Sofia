// Análisis de INE SIN IA: lectura por etiquetas + validaciones oficiales de estructura
// (CURP con dígito verificador, clave de elector, reverso MRZ, CP ↔ estado, vigencia, mayoría de edad).
import { parseIne } from "./ine-parser.js";
import { isValidCurp, curpBirthDate, curpSex, curpMatchesName } from "./mxid.js";
import { pageLines } from "./ocr-obs.js";

// Clave del lector → campo de la solicitud de crédito
const MAP = {
  first_name: "firstName",
  middle_name: "middleName",
  paternal_last_name: "lastName1",
  maternal_last_name: "lastName2",
  curp: "curp",
  voter_key: "voterKey",
  birth_date: "birthDate",
  gender: "sex",
  street: "street",
  exterior_number: "extNumber",
  interior_number: "intNumber",
  neighborhood: "neighborhood",
  postal_code: "postalCode",
  municipality: "municipality",
  state: "state",
};

/** Año de vigencia impreso ("VIGENCIA 2023 - 2033" → 2033). */
function readValidity(obs) {
  for (const p of obs.pages) {
    const lines = pageLines(p).map((l) => l.text.toUpperCase());
    for (let i = 0; i < lines.length; i++) {
      if (!/VIGENCIA/.test(lines[i])) continue;
      const near = [lines[i], lines[i + 1] ?? ""].join(" ");
      const years = [...near.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
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

/**
 * Lee la observación de OCR y devuelve { detected, values, confidence, warnings }.
 * Los valores son OBSERVADOS: siempre se muestran para que la persona los revise.
 */
export function readIne(obs) {
  const r = parseIne(obs, { docTypeIsIne: true });
  const values = {};
  const confidence = {};
  for (const f of r.fields) {
    const key = MAP[f.key];
    if (!key) continue;
    values[key] = f.key === "gender" ? (f.value === "female" ? "M" : "H") : f.value;
    confidence[key] = f.confidence;
  }
  const validity = readValidity(obs);
  if (validity) values.ineValidity = String(validity);
  let warnings = r.warnings;
  if (r.detected && !values.curp) {
    const fixed = repairCurp(obs, values);
    if (fixed) {
      values.curp = fixed;
      confidence.curp = "low";
      warnings = warnings.filter((w) => !w.startsWith("La CURP leída"));
      warnings.push("La CURP traía letras y números confundidos (O/0, I/1…): se corrigió según el formato oficial y la fecha impresa. Revísala.");
    }
  }
  return { detected: r.detected, values, confidence, warnings };
}

// Posiciones de la CURP: 0-3 letras · 4-9 fecha (dígitos) · 10-15 letras · 16 dígito (1900s) o letra (2000s) · 17 dígito
const TO_DIGIT = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", G: "6", B: "8" };
const TO_LETTER = { 0: "O", 1: "I", 2: "Z", 5: "S", 6: "G", 8: "B" };

/**
 * Corrige confusiones típicas de OCR SOLO donde el formato oficial obliga a dígito o letra, y solo
 * acepta el resultado si pasa el dígito verificador y coincide con la fecha impresa (y el sexo/nombre
 * si se leyeron). Sin fecha impresa no se corrige nada: no se inventan datos.
 */
function repairCurp(obs, v) {
  if (!v.birthDate) return null;
  const century19 = Number(v.birthDate.slice(0, 4)) < 2000;
  const tokens = obs.pages.flatMap((p) => pageLines(p).flatMap((l) => {
    const n = l.text.toUpperCase().replace(/^.*?CURP/, "");
    return [...n.replace(/\s+/g, "").matchAll(/[A-Z0-9]{18}/g)].map((m) => m[0]);
  }));
  for (const t of new Set(tokens)) {
    const fixed = [...t].map((ch, i) => {
      const digit = (i >= 4 && i <= 9) || i === 17 || (i === 16 && century19);
      return digit ? (TO_DIGIT[ch] ?? ch) : (TO_LETTER[ch] ?? ch);
    }).join("");
    if (!isValidCurp(fixed) || curpBirthDate(fixed) !== v.birthDate) continue;
    if (v.sex && (curpSex(fixed) === "female" ? "M" : "H") !== v.sex) continue;
    if (v.lastName1 && v.firstName && !curpMatchesName(fixed, { paternal: v.lastName1, maternal: v.lastName2 ?? null, given: [v.firstName, v.middleName].filter(Boolean).join(" ") })) continue;
    return fixed;
  }
  return null;
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
    if (v.birthDate && b && b !== v.birthDate) add(false, "La fecha de nacimiento no coincide con la CURP.");
    const sx = curpSex(curp) === "female" ? "M" : "H";
    if (v.sex && v.sex !== sx) add(false, "El sexo no coincide con la CURP.");
  }
  const birth = v.birthDate || (isValidCurp(curp) ? curpBirthDate(curp) : null);
  const age = ageFrom(birth, now);
  if (age === null) add(null, "Falta la fecha de nacimiento.");
  else if (age < 18) add(false, `Menor de edad (${age} años).`);
  else if (age > 75) add(false, `Edad ${age} años: revisa la política de edad máxima del banco.`);
  else add(true, `Edad: ${age} años.`);
  const year = Number(v.ineValidity);
  if (!v.ineValidity) add(null, "Falta la vigencia de la INE.");
  else if (!Number.isFinite(year)) add(false, "La vigencia de la INE no es un año.");
  else if (year < now.getFullYear()) add(false, `INE vencida (vigencia ${year}).`);
  else add(true, `INE vigente hasta ${year}.`);
  return { checks, age };
}
