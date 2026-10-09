// Análisis de INE: lectura (OCR por etiquetas y/o IA con visión) + validaciones oficiales de estructura
// (CURP con dígito verificador, clave de elector, reverso MRZ, CP ↔ estado, vigencia, mayoría de edad).
// Cuando hay dos lecturas (OCR e IA) se comparan campo por campo: lo que no coincide se marca.
import { parseIne } from "./ine-parser.js";
import { isValidCurp, curpBirthDate, curpSex, curpMatchesName, isValidVoterKey, voterKeyBirthYYMMDD, voterKeySex, stateForPostalCode } from "./mxid.js";
import { pageLines } from "./ocr-obs.js";

// Clave del lector → clave de la solicitud (las mismas del formato oficial del banco)
const MAP = {
  first_name: "first_name", middle_name: "middle_name", paternal_last_name: "paternal_last_name", maternal_last_name: "maternal_last_name",
  curp: "curp", voter_key: "voter_key", birth_date: "birth_date", gender: "gender",
  street: "street", exterior_number: "exterior_number", interior_number: "interior_number", neighborhood: "neighborhood",
  postal_code: "postal_code", municipality: "municipality", state: "state",
};

/**
 * Año de vigencia impreso. Modelo actual: "2023 - 2033" bajo VIGENCIA (las etiquetas FECHA DE NACIMIENTO /
 * SECCIÓN / VIGENCIA y sus valores van en columnas, así que no basta con el renglón de abajo). Modelos
 * anteriores: "VIGENCIA 2024" o "EMISIÓN 2014 VIGENCIA 2024". Devuelve { year, sure }: la credencial vale
 * 10 años desde su emisión; un rango con otra diferencia trae un dígito mal leído (sure = false).
 */
function readValidity(obs, now = new Date()) {
  const plausible = (y) => y >= 2000 && y <= now.getFullYear() + 12;
  const lines = obs.pages.flatMap((p) => pageLines(p).map((l) => l.text.toUpperCase()));
  let loose = null;
  for (const l of lines) {
    // Con anticipación (?=…): en "05/05/1985 2023 - 2033" el 2023 también se prueba como inicio de rango.
    for (const m of l.matchAll(/\b(20\d{2})(?=\s*[-–—]?\s*(20\d{2})\b)/g)) {
      const [from, to] = [Number(m[1]), Number(m[2])];
      if (!plausible(to) || to <= from || to - from > 10) continue;
      if (to - from === 10) return { year: to, sure: true };
      loose ??= to;
    }
  }
  if (loose) return { year: loose, sure: false };
  for (const l of lines) {
    // Un año seguido de "-" es la emisión de un rango cuyo segundo año no se leyó ("VIGENCIA 2023 - 2O33").
    const m = l.match(/VIGENCIA\D{0,12}(20\d{2})\b(?!\s*[-–—])/);
    if (m && plausible(Number(m[1]))) return { year: Number(m[1]), sure: true };
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
const yymmdd = (iso) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);

/** Fecha de la MRZ (AAMMDD, sin siglo). Quien tiene INE es mayor de edad: eso fija el siglo. */
function mrzBirthIso(yymmdd6, now = new Date()) {
  const yy = Number(yymmdd6.slice(0, 2));
  const year = 2000 + yy > now.getFullYear() - 18 ? 1900 + yy : 2000 + yy;
  const iso = `${year}-${yymmdd6.slice(2, 4)}-${yymmdd6.slice(4, 6)}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

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
  let warnings = r.warnings;
  const mrz = r.mrz;

  // Reverso (MRZ con dígitos verificadores): completa lo que el frente no dio y corrige letras del nombre.
  if (mrz) {
    const birth = mrzBirthIso(mrz.birthYYMMDD);
    if (!values.birth_date && birth) { values.birth_date = birth; confidence.birth_date = "low"; }
    if (!values.gender && mrz.sex) { values.gender = mrz.sex; confidence.gender = "low"; }
    if (!mrz.nameRepaired && mrz.surnames.length <= 2 && values.paternal_last_name) fixNameWithMrz(values, confidence, warnings, mrz);
  }
  const printedValidity = readValidity(obs);
  const printed = printedValidity?.year ?? null;
  const mrzValidity = mrz ? 2000 + Number(mrz.expiryYYMMDD.slice(0, 2)) : null;
  const validity = mrzValidity ?? printed;
  if (validity) values.ine_validity = String(validity);
  if (!mrzValidity && printedValidity && !printedValidity.sure) {
    confidence.ine_validity = "low";
    warnings.push("La vigencia leída no queda 10 años después de la emisión: algún dígito pudo leerse mal. Revísala.");
  }
  if (mrzValidity && printed && mrzValidity !== printed) {
    confidence.ine_validity = "low";
    warnings.push("La vigencia impresa no coincide con la del reverso: se usó la del reverso (sus dígitos verificadores cuadran). Revísala.");
  }

  if (r.detected && !values.curp) {
    const c = candidates18(obs, /CURP/);
    const fixed = repairCurp([...c.exact, ...c.edited], values);
    if (fixed) {
      values.curp = fixed;
      confidence.curp = "low";
      warnings = warnings.filter((w) => !w.startsWith("La CURP leída"));
      warnings.push("La CURP traía letras y números confundidos (O/0, I/1…): se corrigió según el formato oficial y la fecha de nacimiento. Revísala.");
    }
  }
  const letters = voterKeyLetters(values);
  if (r.detected && !values.voter_key) {
    // Sin nombre que confirme las 6 letras, solo se corrigen lecturas de 18 caracteres exactos.
    const c = candidates18(obs, /ELECTOR/);
    const fixed = repairVoterKey(letters ? [...c.exact, ...c.edited] : c.exact, values, letters);
    if (fixed) {
      values.voter_key = fixed;
      confidence.voter_key = "low";
      warnings.push("La clave de elector traía letras y números confundidos (O/0, I/1…): se corrigió según el formato oficial y la fecha de nacimiento. Revísala.");
    }
  } else if (values.voter_key && letters && values.voter_key.slice(0, 6) !== letters && confusable(values.voter_key.slice(0, 6), letters) && nameConfirmed(values, mrz)) {
    // Una clave con formato válido solo se cambia si otra fuente confirma el nombre: con un apellido mal
    // leído (GARZA → CARZA) se "corregiría" una clave que estaba bien.
    values.voter_key = letters + values.voter_key.slice(6);
    confidence.voter_key = "low";
    warnings.push("La clave de elector traía una letra confundida (I/L, O/D…): se corrigió con las iniciales del nombre. Revísala.");
  }

  // Sexo no legible en el frente: lo dice la CURP (posición 11), confirmada por su dígito verificador.
  if (!values.gender && values.curp && isValidCurp(values.curp)) { values.gender = sexOf(values.curp); confidence.gender = "low"; }

  // Si la CURP (dígito verificador) y el reverso (MRZ) coinciden entre sí, mandan sobre lo impreso mal leído.
  if (mrz && values.curp && isValidCurp(values.curp)) {
    const curpDate = curpBirthDate(values.curp);
    if (curpDate && yymmdd(curpDate) === mrz.birthYYMMDD && values.birth_date && values.birth_date !== curpDate) {
      values.birth_date = curpDate;
      confidence.birth_date = "low";
      warnings.push("La fecha impresa no coincide con la CURP ni con el reverso: se usó la de la CURP. Revísala.");
    }
    if (mrz.sex && sexOf(values.curp) === mrz.sex && values.gender && values.gender !== mrz.sex) {
      values.gender = mrz.sex;
      confidence.gender = "low";
      warnings.push("El sexo impreso no coincide con la CURP ni con el reverso: se usó el de la CURP. Revísalo.");
    }
  }
  if (r.detected && mrz && !values.curp && !values.street) warnings.push("Se leyó solo el reverso: toma también el frente (o repite su foto) para la CURP, la clave de elector y el domicilio.");
  return { detected: r.detected, values, confidence, warnings, engine: "ocr" };
}

const lettersOnly = (s) => up(s).replace(/[^A-Z]/g, "");
const curpName = (v) => ({ paternal: up(v.paternal_last_name), maternal: up(v.maternal_last_name) || null, given: up([v.first_name, v.middle_name].filter(Boolean).join(" ")) });

/** ¿Confirma el nombre leído una fuente con verificación: la CURP (dígito verificador) o la MRZ sin correcciones? */
function nameConfirmed(v, mrz) {
  if (!v.paternal_last_name || !v.first_name) return false;
  if (v.curp && isValidCurp(v.curp) && curpMatchesName(v.curp, curpName(v))) return true;
  return Boolean(mrz && !mrz.nameRepaired && lettersOnly(v.paternal_last_name) === lettersOnly(mrz.surnames[0]) && lettersOnly(v.maternal_last_name) === lettersOnly(mrz.surnames[1]) && lettersOnly([v.first_name, v.middle_name].join(" ")) === lettersOnly(mrz.givenNames.join(" ")));
}

/**
 * Nombre del frente con una o dos letras mal leídas (I/L, O/Q…): la MRZ del reverso, leída con letra de
 * máquina, lo corrige parte por parte. No se toca lo que la MRZ no puede decir: la Ñ (la MRZ la escribe N),
 * diferencias grandes (otro nombre: eso ya se avisa) ni el último nombre si la MRZ pudo recortarlo.
 */
function fixNameWithMrz(values, confidence, warnings, mrz) {
  const parts = [["paternal_last_name", mrz.surnames[0]], ["maternal_last_name", mrz.surnames[1]], ["first_name", mrz.givenNames[0]], ["middle_name", mrz.givenNames.slice(1).join(" ")]];
  const lastGiven = mrz.givenNames.length > 1 ? "middle_name" : "first_name";
  const fixed = [];
  const curp = values.curp && isValidCurp(values.curp) ? values.curp : null;
  for (const [key, fromMrz] of parts) {
    const read = up(values[key]);
    if (!fromMrz || !read || /Ñ/i.test(values[key]) || (key === lastGiven && mrz.nameTruncated)) continue;
    if (lettersOnly(read) === lettersOnly(fromMrz) || editDistance(read, fromMrz) > 2) continue;
    // El renglón del nombre no tiene dígito verificador: si a la MRZ le faltan letras (sombra, reflejo), el
    // error es suyo; y nunca se acepta una corrección que la CURP (con verificador) contradiga.
    if (lettersOnly(fromMrz).length < lettersOnly(read).length) continue;
    if (curp && !curpMatchesName(curp, curpName({ ...values, [key]: fromMrz }))) continue;
    values[key] = fromMrz;
    confidence[key] = "low";
    fixed.push(ineLabel(key));
  }
  if (fixed.length) warnings.push(`Se corrigió con el reverso (MRZ): ${fixed.join(", ")}. Revísalo contra la credencial.`);
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/**
 * Candidatos de 18 caracteres (CURP, clave de elector) en palabras sueltas y en el renglón sin espacios
 * tras la etiqueta. `exact`: tal cual; `edited`: con un caracter de más (el OCR leyó "0" como "O0") o
 * desplazados; esos solo se aceptan con verificaciones fuertes.
 */
function candidates18(obs, label) {
  const exact = new Set(), edited = new Set();
  for (const p of obs.pages) {
    for (const l of pageLines(p)) {
      const t = l.text.toUpperCase();
      const m = t.match(label);
      const rest = m ? t.slice(m.index + m[0].length) : t;
      for (const run of [...rest.split(/[^A-Z0-9]+/), rest.replace(/[^A-Z0-9]+/g, "")]) {
        if (run.length >= 18) exact.add(run.slice(0, 18));
        for (let i = 1; i + 18 <= run.length && i <= 4; i++) edited.add(run.slice(i, i + 18));
        if (run.length === 19) for (let i = 0; i < 19; i++) edited.add(run.slice(0, i) + run.slice(i + 1));
      }
    }
  }
  return { exact: [...exact], edited: [...edited].filter((t) => !exact.has(t)) };
}

// Confusiones típicas del OCR. La primera opción es la más común; las demás solo se usan si los
// verificadores (dígito, fecha, sexo, nombre) descartan la primera.
const AS_DIGIT = { O: "0", Q: "0", D: "0", U: "0", I: "1", L: "1", T: "71", Z: "27", A: "4", S: "53", G: "69", B: "83" };
const AS_LETTER = { 0: "ODQ", 1: "IL", 2: "Z", 4: "A", 5: "S", 6: "G", 7: "T", 8: "B" };

/**
 * Corrige letras/dígitos confundidos SOLO donde el formato exige dígito ("d") o letra ("l"), y solo si
 * el resultado pasa `valid`. Si dos correcciones distintas son igual de probables, no se elige ninguna.
 */
function repairByFormat(token, kindAt, valid) {
  const opts = [...token].map((ch, i) => {
    const k = kindAt(i);
    if (k === "d") return /\d/.test(ch) ? [ch] : [...(AS_DIGIT[ch] ?? "")];
    if (k === "l") return /[A-ZÑ]/.test(ch) ? [ch] : [...(AS_LETTER[ch] ?? "")];
    return [ch];
  });
  if (opts.some((o) => !o.length) || opts.reduce((n, o) => n * o.length, 1) > 4096) return null;
  let best = null, bestCost = Infinity, tie = false;
  const walk = (i, acc, cost) => {
    if (cost > bestCost) return;
    if (i === opts.length) {
      const s = acc.join("");
      if (!valid(s)) return;
      if (cost < bestCost) { best = s; bestCost = cost; tie = false; } else if (s !== best) tie = true;
      return;
    }
    opts[i].forEach((o, n) => { acc.push(o); walk(i + 1, acc, cost + (n > 0 ? 1 : 0)); acc.pop(); });
  };
  walk(0, [], 0);
  return best && !tie ? best : null;
}

/** Corrección de todos los candidatos: se acepta solo si todos los que se pueden corregir dan lo mismo. */
function uniqueRepair(tokens, kindAt, valid) {
  const found = new Set(tokens.map((t) => repairByFormat(t, kindAt, valid)).filter(Boolean));
  return found.size === 1 ? [...found][0] : null;
}

// Posiciones de la CURP: 0-3 letras · 4-9 fecha (dígitos) · 10-15 letras · 16 dígito (1900s) o letra (2000s) · 17 dígito.
// Sin fecha de nacimiento (impresa o del reverso) no se corrige nada: no se inventan datos.
function repairCurp(tokens, v) {
  if (!v.birth_date) return null;
  const century19 = Number(v.birth_date.slice(0, 4)) < 2000;
  const kindAt = (i) => ((i >= 4 && i <= 9) || i === 17 || (i === 16 && century19) ? "d" : "l");
  return uniqueRepair(tokens, kindAt, (c) => {
    if (!isValidCurp(c) || curpBirthDate(c) !== v.birth_date) return false;
    if (v.gender && sexOf(c) !== v.gender) return false;
    return !(v.paternal_last_name && v.first_name && !curpMatchesName(c, { paternal: v.paternal_last_name, maternal: v.maternal_last_name || null, given: [v.first_name, v.middle_name].filter(Boolean).join(" ") }));
  });
}

// Número de entidad de nacimiento en la clave de elector (posiciones 12-13) ↔ estado de la CURP.
const CURP_STATE_NUM = { AS: "01", BC: "02", BS: "03", CC: "04", CL: "05", CM: "06", CS: "07", CH: "08", DF: "09", DG: "10", GT: "11", GR: "12", HG: "13", JC: "14", MC: "15", MN: "16", MS: "17", NT: "18", NL: "19", OC: "20", PL: "21", QT: "22", QR: "23", SP: "24", SL: "25", SR: "26", TC: "27", TS: "28", TL: "29", VZ: "30", YN: "31", ZS: "32" };

// Posiciones de la clave de elector: 0-5 letras · 6-11 nacimiento AAMMDD · 12-13 entidad · 14 sexo H/M · 15-17 dígitos
function repairVoterKey(tokens, v, letters) {
  if (!v.birth_date) return null;
  const kindAt = (i) => (i <= 5 || i === 14 ? "l" : "d");
  const state = v.curp && isValidCurp(v.curp) ? CURP_STATE_NUM[v.curp.slice(11, 13)] : null;
  return uniqueRepair(tokens, kindAt, (k) => isValidVoterKey(k) && voterKeyBirthYYMMDD(k) === yymmdd(v.birth_date) && (!v.gender || voterKeySex(k) === v.gender) && (!state || k.slice(12, 14) === state) && (!letters || k.slice(0, 6) === letters));
}

/**
 * Las 6 letras de la clave de elector: inicial + primera consonante interna del apellido paterno, del
 * materno y del nombre. Solo con nombres de una palabra sin Ñ (con partículas o nombres como MARÍA/JOSÉ
 * la regla tiene excepciones): si no aplica, null y no se usa.
 */
function voterKeyLetters(v) {
  if ([v.paternal_last_name, v.maternal_last_name, v.first_name].some((p) => /ñ/i.test(p ?? ""))) return null;
  const parts = [v.paternal_last_name, v.maternal_last_name, v.first_name].map(up);
  if (parts.some((p) => !/^[A-Z]{2,}$/.test(p)) || ["MARIA", "MA", "JOSE"].includes(parts[2])) return null;
  return parts.map((p) => p[0] + (p.slice(1).match(/[B-DF-HJ-NP-TV-Z]/)?.[0] ?? "X")).join("");
}

// Letras que el OCR confunde entre sí: una diferencia dentro del mismo grupo es un error de lectura.
const CONFUSABLE = ["IL1", "ODQ0", "CG", "EF", "B8", "S5", "MN", "UV", "Z2"];
const confusable = (a, b) => [...a].every((ch, i) => ch === b[i] || CONFUSABLE.some((g) => g.includes(ch) && g.includes(b[i])));

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

/**
 * Dos lecturas independientes de la misma credencial (p. ej. el lector del teléfono y el de Google Drive):
 * lo que coincide queda verificado; si difieren, gana la que pasa el formato oficial (CURP, clave de
 * elector) y si ninguna lo resuelve, el campo se marca para revisar. Nunca se oculta una diferencia.
 */
export function combineReadings(a, b, label = "Google") {
  if (!b?.detected) return a;
  if (!a?.detected) return { ...b, engine: "google" };
  const values = { ...a.values };
  const confidence = { ...a.confidence };
  const valid = { curp: isValidCurp, voter_key: isValidVoterKey };
  const diff = [];
  for (const [k, vb] of Object.entries(b.values)) {
    const va = values[k];
    if (!va) { values[k] = vb; confidence[k] = b.confidence[k] ?? "low"; continue; }
    if (up(va) === up(vb)) { confidence[k] = "high"; continue; }
    const ok = valid[k];
    if (ok?.(vb) && !ok(va)) { values[k] = vb; confidence[k] = "medium"; continue; }
    if (ok?.(va) && !ok(vb)) continue;
    diff.push(k);
    confidence[k] = "low";
  }
  const warnings = [...a.warnings];
  if (diff.length) warnings.push(`El lector del teléfono y el de ${label} no coinciden en: ${diff.map(ineLabel).join(", ")}. Revisa esos campos contra la credencial.`);
  return { ...a, detected: true, values, confidence, warnings, engine: `${a.engine ?? "ocr"}+google` };
}
