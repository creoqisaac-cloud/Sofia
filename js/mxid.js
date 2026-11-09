// GENERADO por scripts/prueba-generar.mjs desde src/server/extraction/mx-id.ts. No editar a mano.
const CURP_STATES = {
  AS: "Aguascalientes",
  BC: "Baja California",
  BS: "Baja California Sur",
  CC: "Campeche",
  CL: "Coahuila",
  CM: "Colima",
  CS: "Chiapas",
  CH: "Chihuahua",
  DF: "Ciudad de M\xE9xico",
  DG: "Durango",
  GT: "Guanajuato",
  GR: "Guerrero",
  HG: "Hidalgo",
  JC: "Jalisco",
  MC: "Estado de M\xE9xico",
  MN: "Michoac\xE1n",
  MS: "Morelos",
  NT: "Nayarit",
  NL: "Nuevo Le\xF3n",
  OC: "Oaxaca",
  PL: "Puebla",
  QT: "Quer\xE9taro",
  QR: "Quintana Roo",
  SP: "San Luis Potos\xED",
  SL: "Sinaloa",
  SR: "Sonora",
  TC: "Tabasco",
  TS: "Tamaulipas",
  TL: "Tlaxcala",
  VZ: "Veracruz",
  YN: "Yucat\xE1n",
  ZS: "Zacatecas",
  NE: "Nacido en el extranjero"
};
const CURP_RE = /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX]([A-Z]{2})[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;
const CURP_DICT = "0123456789ABCDEFGHIJKLMN\xD1OPQRSTUVWXYZ";
function curpCheckDigit(curp17) {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += CURP_DICT.indexOf(curp17[i]) * (18 - i);
  return (10 - sum % 10) % 10;
}
function isValidCurp(v) {
  const m = v.match(CURP_RE);
  if (!m || !CURP_STATES[m[3]]) return false;
  const birth = curpBirthDate(v);
  if (!birth || birth > (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) return false;
  return curpCheckDigit(v.slice(0, 17)) === Number(v[17]);
}
function isoDate(y, mo, d) {
  const iso = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = /* @__PURE__ */ new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso ? null : iso;
}
function curpBirthDate(curp) {
  const yy = Number(curp.slice(4, 6));
  const century = /\d/.test(curp[16] ?? "") ? 1900 : 2e3;
  return isoDate(century + yy, Number(curp.slice(6, 8)), Number(curp.slice(8, 10)));
}
const curpSex = (curp) => curp[10] === "H" ? "male" : curp[10] === "M" ? "female" : null;
const PARTICLES = /* @__PURE__ */ new Set(["DA", "DAS", "DE", "DEL", "DER", "DI", "DIE", "DD", "EL", "LA", "LOS", "LAS", "LE", "LES", "MAC", "MC", "VAN", "VON", "Y"]);
const COMMON_FIRST = /* @__PURE__ */ new Set(["MARIA", "MA", "MA.", "JOSE", "J", "J."]);
function mainWord(words, skipCommon = false) {
  const w = words.filter((x) => !PARTICLES.has(x));
  if (skipCommon && w.length > 1 && COMMON_FIRST.has(w[0])) return w[1];
  return w[0] ?? "";
}
const letter = (c) => c === "\xD1" ? "X" : c ?? "X";
const firstInternal = (word, re) => letter(word.slice(1).split("").find((c) => re.test(c)));
function curpMatchesName(curp, name) {
  const pat = mainWord(name.paternal.split(/\s+/));
  const mat = name.maternal ? mainWord(name.maternal.split(/\s+/)) : "";
  const giv = mainWord(name.given.split(/\s+/), true);
  if (!pat || !giv) return false;
  const eq = (curpChar, expected) => curpChar === "X" || curpChar === expected;
  return curp[0] === letter(pat[0]) && eq(curp[1], firstInternal(pat, /[AEIOU]/)) && (mat ? eq(curp[2], letter(mat[0])) : curp[2] === "X") && curp[3] === letter(giv[0]) && eq(curp[13], firstInternal(pat, /[B-DF-HJ-NP-TV-ZÑ]/)) && (mat ? eq(curp[14], firstInternal(mat, /[B-DF-HJ-NP-TV-ZÑ]/)) : curp[14] === "X") && eq(curp[15], firstInternal(giv, /[B-DF-HJ-NP-TV-ZÑ]/));
}
const VOTER_KEY_RE = /^[A-Z]{6}(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{2}[HM]\d{3}$/;
const isValidVoterKey = (v) => VOTER_KEY_RE.test(v);
const voterKeyBirthYYMMDD = (v) => v.slice(6, 12);
const voterKeySex = (v) => v[14] === "H" ? "male" : "female";
function mrzValue(c) {
  if (c === "<") return 0;
  if (/\d/.test(c)) return Number(c);
  return c.charCodeAt(0) - 55;
}
function mrzCheck(s) {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += mrzValue(s[i]) * w[i % 3];
  return sum % 10;
}
const MRZ_TO_DIGIT = { O: "0", Q: "0", D: "0", U: "0", I: "1", L: "1", Z: "2", A: "4", S: "5", G: "6", B: "8" };
const MRZ_TO_LETTER = { "0": "O", "1": "I", "2": "Z", "4": "A", "5": "S", "6": "G", "8": "B" };
const asDigits = (s) => s.replace(/[A-Z]/g, (c) => MRZ_TO_DIGIT[c] ?? c);
const asLetters = (s) => s.replace(/\d/g, (c) => MRZ_TO_LETTER[c] ?? c);
function normalizeMrzLine(raw) {
  return raw.toUpperCase().replace(/«/g, "<<").replace(/[‹〈＜(\[{]/g, "<").replace(/[^A-Z0-9<]/g, "");
}
const MRZ_SEX = { H: "male", M: "female", F: "female" };
function mrzLine2(raw) {
  if (raw.length < 28 || raw.length > 34) return null;
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
function mrzLine3(raw) {
  if (raw.length < 5 || !/^[A-Z]/.test(asLetters(raw))) return null;
  let line = asLetters(raw).replace(/K{2,}/g, (k) => "<".repeat(k.length));
  let repaired = line !== raw;
  if (!/^[A-Z<]+$/.test(line)) return null;
  if (line.length > 30) {
    const core = line.replace(/<+$/, "");
    if (core.length > 30) repaired = true;
    line = core.slice(0, 30);
  }
  return { line: line.padEnd(30, "<"), repaired };
}
function parseMrz(lines) {
  const cand = lines.map(normalizeMrzLine).filter((l) => l.length >= 5);
  for (let j = 0; j < cand.length; j++) {
    const r2 = mrzLine2(cand[j]);
    if (!r2) continue;
    const l2 = r2.line;
    let raw1 = "";
    for (const i of [j - 1, j - 2]) {
      const head = i >= 0 ? cand[i].match(/[I1L][D0O]MEX/) : null;
      if (head && cand[i].length - head.index >= 26) {
        raw1 = cand[i].slice(head.index);
        break;
      }
    }
    if (!raw1 && l2.slice(15, 18) !== "MEX") continue;
    const l1 = raw1 ? ("IDMEX" + asDigits(raw1.slice(5, 15)) + raw1.slice(15)).padEnd(30, "<").slice(0, 30) : "";
    const r3 = cand[j + 1] ? mrzLine3(cand[j + 1]) : null;
    const l3 = r3?.line ?? "";
    const idx = l3.indexOf("<<");
    const sur = idx >= 0 ? l3.slice(0, idx) : l3;
    const giv = idx >= 0 ? l3.slice(idx + 2) : "";
    const composite = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
    return {
      birthYYMMDD: l2.slice(0, 6),
      expiryYYMMDD: l2.slice(8, 14),
      sex: MRZ_SEX[l2[7]] ?? null,
      surnames: sur.split("<").filter(Boolean),
      givenNames: giv.split("<").filter(Boolean),
      repaired: r2.repaired || raw1.slice(0, 15) !== l1.slice(0, 15),
      nameRepaired: Boolean(r3?.repaired),
      nameTruncated: l3.length === 30 && l3[29] !== "<",
      compositeOk: Boolean(l1) && mrzCheck(composite) === Number(l2[29])
    };
  }
  return null;
}
function mrzRowTexts(lines) {
  const rows = [];
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
const STATE_ABBR = {
  AGS: "Aguascalientes",
  AGUASCALIENTES: "Aguascalientes",
  BC: "Baja California",
  BAJACALIFORNIA: "Baja California",
  BCS: "Baja California Sur",
  BAJACALIFORNIASUR: "Baja California Sur",
  CAMP: "Campeche",
  CAMPECHE: "Campeche",
  COAH: "Coahuila",
  COAHUILA: "Coahuila",
  COL: "Colima",
  COLIMA: "Colima",
  CHIS: "Chiapas",
  CHIAPAS: "Chiapas",
  CHIH: "Chihuahua",
  CHIHUAHUA: "Chihuahua",
  CDMX: "Ciudad de M\xE9xico",
  DF: "Ciudad de M\xE9xico",
  CIUDADDEMEXICO: "Ciudad de M\xE9xico",
  DGO: "Durango",
  DURANGO: "Durango",
  GTO: "Guanajuato",
  GUANAJUATO: "Guanajuato",
  GRO: "Guerrero",
  GUERRERO: "Guerrero",
  HGO: "Hidalgo",
  HIDALGO: "Hidalgo",
  JAL: "Jalisco",
  JALISCO: "Jalisco",
  MEX: "Estado de M\xE9xico",
  EDOMEX: "Estado de M\xE9xico",
  ESTADODEMEXICO: "Estado de M\xE9xico",
  MICH: "Michoac\xE1n",
  MICHOACAN: "Michoac\xE1n",
  MOR: "Morelos",
  MORELOS: "Morelos",
  NAY: "Nayarit",
  NAYARIT: "Nayarit",
  NL: "Nuevo Le\xF3n",
  NUEVOLEON: "Nuevo Le\xF3n",
  OAX: "Oaxaca",
  OAXACA: "Oaxaca",
  PUE: "Puebla",
  PUEBLA: "Puebla",
  QRO: "Quer\xE9taro",
  QUERETARO: "Quer\xE9taro",
  QROO: "Quintana Roo",
  QR: "Quintana Roo",
  QUINTANAROO: "Quintana Roo",
  SLP: "San Luis Potos\xED",
  SANLUISPOTOSI: "San Luis Potos\xED",
  SIN: "Sinaloa",
  SINALOA: "Sinaloa",
  SON: "Sonora",
  SONORA: "Sonora",
  TAB: "Tabasco",
  TABASCO: "Tabasco",
  TAMPS: "Tamaulipas",
  TAMAULIPAS: "Tamaulipas",
  TLAX: "Tlaxcala",
  TLAXCALA: "Tlaxcala",
  VER: "Veracruz",
  VERACRUZ: "Veracruz",
  YUC: "Yucat\xE1n",
  YUCATAN: "Yucat\xE1n",
  ZAC: "Zacatecas",
  ZACATECAS: "Zacatecas"
};
function stateFromAbbr(raw) {
  const k = raw.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z]/g, "");
  return STATE_ABBR[k] ?? null;
}
const CP_RANGES = [
  [1, 16, "Ciudad de M\xE9xico"],
  [20, 20, "Aguascalientes"],
  [21, 22, "Baja California"],
  [23, 23, "Baja California Sur"],
  [24, 24, "Campeche"],
  [25, 27, "Coahuila"],
  [28, 28, "Colima"],
  [29, 30, "Chiapas"],
  [31, 33, "Chihuahua"],
  [34, 35, "Durango"],
  [36, 38, "Guanajuato"],
  [39, 41, "Guerrero"],
  [42, 43, "Hidalgo"],
  [44, 49, "Jalisco"],
  [50, 57, "Estado de M\xE9xico"],
  [58, 61, "Michoac\xE1n"],
  [62, 62, "Morelos"],
  [63, 63, "Nayarit"],
  [64, 67, "Nuevo Le\xF3n"],
  [68, 71, "Oaxaca"],
  [72, 75, "Puebla"],
  [76, 76, "Quer\xE9taro"],
  [77, 77, "Quintana Roo"],
  [78, 79, "San Luis Potos\xED"],
  [80, 82, "Sinaloa"],
  [83, 85, "Sonora"],
  [86, 86, "Tabasco"],
  [87, 89, "Tamaulipas"],
  [90, 90, "Tlaxcala"],
  [91, 96, "Veracruz"],
  [97, 97, "Yucat\xE1n"],
  [98, 99, "Zacatecas"]
];
function stateForPostalCode(cp) {
  if (!/^\d{5}$/.test(cp)) return null;
  const p = Number(cp.slice(0, 2));
  return CP_RANGES.find(([a, b]) => p >= a && p <= b)?.[2] ?? null;
}
export {
  curpBirthDate,
  curpCheckDigit,
  curpMatchesName,
  curpSex,
  isValidCurp,
  isValidVoterKey,
  mrzCheck,
  mrzRowTexts,
  normalizeMrzLine,
  parseMrz,
  stateForPostalCode,
  stateFromAbbr,
  voterKeyBirthYYMMDD,
  voterKeySex
};
