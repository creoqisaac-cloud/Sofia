/**
 * Validaciones estructurales de identificaciones mexicanas (sin datos de nadie):
 * CURP (estructura + dígito verificador + iniciales), clave de elector, MRZ TD1 (ICAO 9303),
 * estados y rangos de código postal (SEPOMEX).
 */

// ───────── CURP ─────────

const CURP_STATES: Record<string, string> = {
  AS: "Aguascalientes", BC: "Baja California", BS: "Baja California Sur", CC: "Campeche", CL: "Coahuila", CM: "Colima",
  CS: "Chiapas", CH: "Chihuahua", DF: "Ciudad de México", DG: "Durango", GT: "Guanajuato", GR: "Guerrero", HG: "Hidalgo",
  JC: "Jalisco", MC: "Estado de México", MN: "Michoacán", MS: "Morelos", NT: "Nayarit", NL: "Nuevo León", OC: "Oaxaca",
  PL: "Puebla", QT: "Querétaro", QR: "Quintana Roo", SP: "San Luis Potosí", SL: "Sinaloa", SR: "Sonora", TC: "Tabasco",
  TS: "Tamaulipas", TL: "Tlaxcala", VZ: "Veracruz", YN: "Yucatán", ZS: "Zacatecas", NE: "Nacido en el extranjero",
};

const CURP_RE = /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX]([A-Z]{2})[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;
const CURP_DICT = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

export function curpCheckDigit(curp17: string): number {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += CURP_DICT.indexOf(curp17[i]!) * (18 - i);
  return (10 - (sum % 10)) % 10;
}

/**
 * Estructura + estado válido + fecha real (no futura) + dígito verificador. No corrige caracteres.
 * Ojo: el dígito verificador NO distingue "0"↔"O" en la posición 17 (25·2 ≡ 0 mod 10); ese error de
 * OCR se detecta porque la letra implica siglo 2000 → fecha futura o distinta de la impresa.
 */
export function isValidCurp(v: string): boolean {
  const m = v.match(CURP_RE);
  if (!m || !CURP_STATES[m[3]!]) return false;
  const birth = curpBirthDate(v);
  if (!birth || birth > new Date().toISOString().slice(0, 10)) return false;
  return curpCheckDigit(v.slice(0, 17)) === Number(v[17]);
}

function isoDate(y: number, mo: number, d: number): string | null {
  const iso = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** Fecha de nacimiento codificada (posición 17: dígito → 1900s, letra → 2000s). */
export function curpBirthDate(curp: string): string | null {
  const yy = Number(curp.slice(4, 6));
  const century = /\d/.test(curp[16] ?? "") ? 1900 : 2000;
  return isoDate(century + yy, Number(curp.slice(6, 8)), Number(curp.slice(8, 10)));
}

export const curpSex = (curp: string): "male" | "female" | null => (curp[10] === "H" ? "male" : curp[10] === "M" ? "female" : null);

const PARTICLES = new Set(["DA", "DAS", "DE", "DEL", "DER", "DI", "DIE", "DD", "EL", "LA", "LOS", "LAS", "LE", "LES", "MAC", "MC", "VAN", "VON", "Y"]);
const COMMON_FIRST = new Set(["MARIA", "MA", "MA.", "JOSE", "J", "J."]);

function mainWord(words: string[], skipCommon = false): string {
  const w = words.filter((x) => !PARTICLES.has(x));
  if (skipCommon && w.length > 1 && COMMON_FIRST.has(w[0]!)) return w[1]!;
  return w[0] ?? "";
}

const letter = (c: string | undefined) => (c === "Ñ" ? "X" : (c ?? "X"));
const firstInternal = (word: string, re: RegExp) => letter(word.slice(1).split("").find((c) => re.test(c)));

/**
 * ¿Las iniciales y consonantes internas de la CURP son compatibles con el nombre leído?
 * Tolerante con la "X" (palabras inconvenientes, Ñ, sin segundo apellido). Sirve para detectar
 * renglones cambiados o mal leídos, no para inventar nada.
 */
export function curpMatchesName(curp: string, name: { paternal: string; maternal?: string | null; given: string }): boolean {
  const pat = mainWord(name.paternal.split(/\s+/));
  const mat = name.maternal ? mainWord(name.maternal.split(/\s+/)) : "";
  const giv = mainWord(name.given.split(/\s+/), true);
  if (!pat || !giv) return false;
  const eq = (curpChar: string, expected: string) => curpChar === "X" || curpChar === expected;
  return (
    curp[0] === letter(pat[0]) &&
    eq(curp[1]!, firstInternal(pat, /[AEIOU]/)) &&
    (mat ? eq(curp[2]!, letter(mat[0])) : curp[2] === "X") &&
    curp[3] === letter(giv[0]) &&
    eq(curp[13]!, firstInternal(pat, /[B-DF-HJ-NP-TV-ZÑ]/)) &&
    (mat ? eq(curp[14]!, firstInternal(mat, /[B-DF-HJ-NP-TV-ZÑ]/)) : curp[14] === "X") &&
    eq(curp[15]!, firstInternal(giv, /[B-DF-HJ-NP-TV-ZÑ]/))
  );
}

// ───────── Clave de elector ─────────

const VOTER_KEY_RE = /^[A-Z]{6}(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{2}[HM]\d{3}$/;
export const isValidVoterKey = (v: string) => VOTER_KEY_RE.test(v);
/** AAMMDD de nacimiento (sin siglo) codificado en la clave de elector. */
export const voterKeyBirthYYMMDD = (v: string) => v.slice(6, 12);
export const voterKeySex = (v: string): "male" | "female" => (v[14] === "H" ? "male" : "female");

// ───────── MRZ TD1 (reverso de la credencial) ─────────

function mrzValue(c: string): number {
  if (c === "<") return 0;
  if (/\d/.test(c)) return Number(c);
  return c.charCodeAt(0) - 55; // A=10
}
export function mrzCheck(s: string): number {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += mrzValue(s[i]!) * w[i % 3]!;
  return sum % 10;
}

export interface MrzData {
  birthYYMMDD: string;
  /** Vencimiento AAMMDD: en la INE el año es el de la VIGENCIA impresa en el frente. */
  expiryYYMMDD: string;
  sex: "male" | "female" | null;
  surnames: string[];
  givenNames: string[];
  /** Se corrigieron letras/números confundidos en fechas o encabezado; los dígitos verificadores los confirman. */
  repaired: boolean;
  /** El renglón del nombre traía caracteres imposibles y se corrigió: ese renglón NO tiene dígito verificador. */
  nameRepaired: boolean;
  /** El nombre llena los 30 caracteres: el último nombre pudo quedar recortado. */
  nameTruncated: boolean;
  /** Cuadra el dígito verificador compuesto (renglones 1 y 2 completos). */
  compositeOk: boolean;
}

// Confusiones típicas del OCR. Solo se aplican donde el formato exige dígito (o letra), y el
// resultado se acepta únicamente si los dígitos verificadores cuadran.
const MRZ_TO_DIGIT: Record<string, string> = { O: "0", Q: "0", D: "0", U: "0", I: "1", L: "1", Z: "2", A: "4", S: "5", G: "6", B: "8" };
const MRZ_TO_LETTER: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "4": "A", "5": "S", "6": "G", "8": "B" };
const asDigits = (s: string) => s.replace(/[A-Z]/g, (c) => MRZ_TO_DIGIT[c] ?? c);
const asLetters = (s: string) => s.replace(/\d/g, (c) => MRZ_TO_LETTER[c] ?? c);

/** Renglón crudo del OCR → solo A-Z, 0-9 y "<" ("«", "‹", "(", "[" … son "<" mal leídos). */
export function normalizeMrzLine(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/«/g, "<<")
    .replace(/[‹〈＜(\[{]/g, "<")
    .replace(/[^A-Z0-9<]/g, "");
}

/**
 * Sexo en la MRZ. La INE NO usa el M/F de ICAO: usa H (hombre) / M (mujer), igual que el frente.
 * F se acepta como mujer por si algún documento sigue ICAO.
 */
const MRZ_SEX: Record<string, "male" | "female"> = { H: "male", M: "female", F: "female" };

/** Renglón 2: nacimiento, sexo y vencimiento, aceptado solo si sus dígitos verificadores cuadran. */
function mrzLine2(raw: string): { line: string; repaired: boolean } | null {
  if (raw.length < 28 || raw.length > 34) return null;
  // Un caracter de más al inicio (borde de la credencial) se prueba quitándolo.
  for (let off = 0; off <= Math.max(0, raw.length - 30); off++) {
    const l = raw.slice(off);
    const birth = asDigits(l.slice(0, 7)), expiry = asDigits(l.slice(8, 15));
    if (!/^\d{7}$/.test(birth) || !/^\d{7}$/.test(expiry)) continue;
    if (mrzCheck(birth.slice(0, 6)) !== Number(birth[6]) || mrzCheck(expiry.slice(0, 6)) !== Number(expiry[6])) continue;
    const line = (birth + l[7] + expiry + asLetters(l.slice(15, 18)) + l.slice(18)).padEnd(30, "<").slice(0, 30);
    return { line, repaired: off > 0 || line.slice(0, 18) !== l.slice(0, 18) };
  }
  return null;
}

/** Renglón 3: APELLIDOS<<NOMBRES, solo letras y "<". Los dígitos son letras mal leídas (0→O, 1→I…). */
function mrzLine3(raw: string): { line: string; repaired: boolean } | null {
  if (raw.length < 5 || !/^[A-Z]/.test(asLetters(raw))) return null;
  let line = asLetters(raw).replace(/K{2,}/g, (k) => "<".repeat(k.length)); // "<<" leído como "KK"
  let repaired = line !== raw;
  if (!/^[A-Z<]+$/.test(line)) return null;
  if (line.length > 30) {
    const core = line.replace(/<+$/, "");
    if (core.length > 30) repaired = true; // sobra texto (¿un borde leído como letra?): no se sabe cuál
    line = core.slice(0, 30);
  }
  return { line: line.padEnd(30, "<"), repaired };
}

/**
 * MRZ TD1 de la credencial (3 renglones de 30). Acepta solo estructura válida: dígitos verificadores de
 * nacimiento y vencimiento correctos, y "IDMEX" en el renglón 1 (o, si ese renglón no se leyó, "MEX"
 * como nacionalidad). Corrige confusiones O/0, I/1… SOLO donde el formato exige dígito o letra (y lo
 * marca); los "<" mal leídos se normalizan. El renglón del nombre es opcional.
 */
export function parseMrz(lines: string[]): MrzData | null {
  const cand = lines.map(normalizeMrzLine).filter((l) => l.length >= 5);
  for (let j = 0; j < cand.length; j++) {
    const r2 = mrzLine2(cand[j]!);
    if (!r2) continue;
    const l2 = r2.line;
    let raw1 = "";
    for (const i of [j - 1, j - 2]) {
      const head = i >= 0 ? cand[i]!.match(/[I1L][D0O]MEX/) : null;
      if (head && cand[i]!.length - head.index! >= 26) { raw1 = cand[i]!.slice(head.index!); break; }
    }
    if (!raw1 && l2.slice(15, 18) !== "MEX") continue;
    const l1 = raw1 ? ("IDMEX" + asDigits(raw1.slice(5, 15)) + raw1.slice(15)).padEnd(30, "<").slice(0, 30) : "";
    const r3 = cand[j + 1] ? mrzLine3(cand[j + 1]!) : null;
    const l3 = r3?.line ?? "";
    const idx = l3.indexOf("<<");
    const sur = idx >= 0 ? l3.slice(0, idx) : l3;
    const giv = idx >= 0 ? l3.slice(idx + 2) : "";
    const composite = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
    return {
      birthYYMMDD: l2.slice(0, 6),
      expiryYYMMDD: l2.slice(8, 14),
      sex: MRZ_SEX[l2[7]!] ?? null,
      surnames: sur.split("<").filter(Boolean),
      givenNames: giv.split("<").filter(Boolean),
      repaired: r2.repaired || raw1.slice(0, 15) !== l1.slice(0, 15),
      nameRepaired: Boolean(r3?.repaired),
      nameTruncated: l3.length === 30 && l3[29] !== "<",
      compositeOk: Boolean(l1) && mrzCheck(composite) === Number(l2[29]),
    };
  }
  return null;
}

/**
 * Textos por renglón para buscar la MRZ: une los pedazos que el OCR entrega separados en la misma
 * altura (ML Kit corta renglones con letras muy espaciadas), de izquierda a derecha.
 */
export function mrzRowTexts(lines: Array<{ text: string; box: { left: number; top: number; right: number; bottom: number } }>): string[] {
  const rows: Array<{ top: number; bottom: number; parts: Array<{ left: number; text: string }> }> = [];
  for (const l of [...lines].sort((a, b) => a.box.top - b.box.top)) {
    const h = l.box.bottom - l.box.top;
    const row = rows.find((r) => Math.min(r.bottom, l.box.bottom) - Math.max(r.top, l.box.top) >= 0.5 * Math.min(h, r.bottom - r.top));
    if (row) {
      row.parts.push({ left: l.box.left, text: l.text });
      row.top = Math.min(row.top, l.box.top);
      row.bottom = Math.max(row.bottom, l.box.bottom);
    } else rows.push({ top: l.box.top, bottom: l.box.bottom, parts: [{ left: l.box.left, text: l.text }] });
  }
  return rows.map((r) => r.parts.sort((a, b) => a.left - b.left).map((p) => p.text).join(""));
}

// ───────── Estados y CP ─────────

const STATE_ABBR: Record<string, string> = {
  AGS: "Aguascalientes", AGUASCALIENTES: "Aguascalientes",
  BC: "Baja California", BAJACALIFORNIA: "Baja California",
  BCS: "Baja California Sur", BAJACALIFORNIASUR: "Baja California Sur",
  CAMP: "Campeche", CAMPECHE: "Campeche",
  COAH: "Coahuila", COAHUILA: "Coahuila",
  COL: "Colima", COLIMA: "Colima",
  CHIS: "Chiapas", CHIAPAS: "Chiapas",
  CHIH: "Chihuahua", CHIHUAHUA: "Chihuahua",
  CDMX: "Ciudad de México", DF: "Ciudad de México", CIUDADDEMEXICO: "Ciudad de México",
  DGO: "Durango", DURANGO: "Durango",
  GTO: "Guanajuato", GUANAJUATO: "Guanajuato",
  GRO: "Guerrero", GUERRERO: "Guerrero",
  HGO: "Hidalgo", HIDALGO: "Hidalgo",
  JAL: "Jalisco", JALISCO: "Jalisco",
  MEX: "Estado de México", EDOMEX: "Estado de México", ESTADODEMEXICO: "Estado de México",
  MICH: "Michoacán", MICHOACAN: "Michoacán",
  MOR: "Morelos", MORELOS: "Morelos",
  NAY: "Nayarit", NAYARIT: "Nayarit",
  NL: "Nuevo León", NUEVOLEON: "Nuevo León",
  OAX: "Oaxaca", OAXACA: "Oaxaca",
  PUE: "Puebla", PUEBLA: "Puebla",
  QRO: "Querétaro", QUERETARO: "Querétaro",
  QROO: "Quintana Roo", QR: "Quintana Roo", QUINTANAROO: "Quintana Roo",
  SLP: "San Luis Potosí", SANLUISPOTOSI: "San Luis Potosí",
  SIN: "Sinaloa", SINALOA: "Sinaloa",
  SON: "Sonora", SONORA: "Sonora",
  TAB: "Tabasco", TABASCO: "Tabasco",
  TAMPS: "Tamaulipas", TAMAULIPAS: "Tamaulipas",
  TLAX: "Tlaxcala", TLAXCALA: "Tlaxcala",
  VER: "Veracruz", VERACRUZ: "Veracruz",
  YUC: "Yucatán", YUCATAN: "Yucatán",
  ZAC: "Zacatecas", ZACATECAS: "Zacatecas",
};

/** "CDMX." / "Q. ROO" / "N.L." → nombre del estado; null si no es un estado reconocible. */
export function stateFromAbbr(raw: string): string | null {
  const k = raw.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z]/g, "");
  return STATE_ABBR[k] ?? null;
}

const CP_RANGES: Array<[number, number, string]> = [
  [1, 16, "Ciudad de México"], [20, 20, "Aguascalientes"], [21, 22, "Baja California"], [23, 23, "Baja California Sur"],
  [24, 24, "Campeche"], [25, 27, "Coahuila"], [28, 28, "Colima"], [29, 30, "Chiapas"], [31, 33, "Chihuahua"],
  [34, 35, "Durango"], [36, 38, "Guanajuato"], [39, 41, "Guerrero"], [42, 43, "Hidalgo"], [44, 49, "Jalisco"],
  [50, 57, "Estado de México"], [58, 61, "Michoacán"], [62, 62, "Morelos"], [63, 63, "Nayarit"], [64, 67, "Nuevo León"],
  [68, 71, "Oaxaca"], [72, 75, "Puebla"], [76, 76, "Querétaro"], [77, 77, "Quintana Roo"], [78, 79, "San Luis Potosí"],
  [80, 82, "Sinaloa"], [83, 85, "Sonora"], [86, 86, "Tabasco"], [87, 89, "Tamaulipas"], [90, 90, "Tlaxcala"],
  [91, 96, "Veracruz"], [97, 97, "Yucatán"], [98, 99, "Zacatecas"],
];

/** Estado al que corresponde un CP (por sus dos primeros dígitos); null si el rango no existe. */
export function stateForPostalCode(cp: string): string | null {
  if (!/^\d{5}$/.test(cp)) return null;
  const p = Number(cp.slice(0, 2));
  return CP_RANGES.find(([a, b]) => p >= a && p <= b)?.[2] ?? null;
}
