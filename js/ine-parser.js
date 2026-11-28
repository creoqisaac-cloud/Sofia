// GENERADO por scripts/prueba-generar.mjs desde src/server/extraction/ine.ts. No editar a mano.
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/server/extraction/ine.ts
import { curpBirthDate, curpMatchesName, curpSex, isValidCurp, isValidVoterKey, mrzRowTexts, parseMrz, stateForPostalCode, stateFromAbbr, voterKeyBirthYYMMDD, voterKeySex } from "./mxid.js";
import { pageLines } from "./ocr-obs.js";
var normOcr = (s) => s.toUpperCase().replace(/Ñ/g, "\0").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\u0000/g, "\xD1").replace(/\s+/g, " ").trim();
function lev(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
var LABELS = {
  nombre: "NOMBRE",
  domicilio: "DOMICILIO",
  clave: "CLAVE DE ELECTOR",
  curp: "CURP",
  fecha: "FECHA DE NACIMIENTO",
  sexo: "SEXO",
  registro: "A\xD1O DE REGISTRO",
  seccion: "SECCION",
  vigencia: "VIGENCIA",
  emision: "EMISION",
  estado: "ESTADO",
  municipio: "MUNICIPIO",
  localidad: "LOCALIDAD",
  edad: "EDAD"
};
function matchLabel(n, label) {
  const tokens = n.split(" ");
  const target = label.replace(/\s+/g, "");
  const tol = target.length >= 12 ? 2 : target.length >= 6 ? 1 : 0;
  const maxK = Math.min(tokens.length, label.split(" ").length + 1);
  for (let k = 1; k <= maxK; k++) {
    if (lev(tokens.slice(0, k).join(""), target) <= tol) return tokens.slice(k).join(" ");
  }
  return null;
}
var labelOf = (l) => Object.keys(LABELS).find((k) => matchLabel(l.n, LABELS[k]) !== null) ?? null;
var NON_NAME = /* @__PURE__ */ new Set(["INSTITUTO NACIONAL ELECTORAL", "INSTITUTO FEDERAL ELECTORAL", "MEXICO", "ESTADOS UNIDOS MEXICANOS", "CREDENCIAL PARA VOTAR", "FIRMA", "MUESTRA"]);
var NAME_LINE = /^[A-ZÑ]+(?:\.?[ '-][A-ZÑ]+)*\.?$/;
var isNameLine = (n) => NAME_LINE.test(n) && n.length >= 2 && n.length <= 40 && !NON_NAME.has(n);
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}
var PageGeo = class {
  constructor(lines) {
    __publicField(this, "lines");
    __publicField(this, "h");
    this.lines = lines;
    this.h = Math.max(1, median(lines.map((l) => l.box.bottom - l.box.top)));
  }
  find(key) {
    return this.lines.find((l) => matchLabel(l.n, LABELS[key]) !== null);
  }
  /** Renglones alineados a la izquierda debajo de la etiqueta, contiguos, hasta otra etiqueta. */
  below(label, max) {
    const { h } = this;
    const cands = this.lines.filter((l) => l !== label && l.box.top > label.box.top + 0.4 * h && Math.abs(l.box.left - label.box.left) <= 2.5 * h).sort((a, b) => a.box.top - b.box.top);
    const out = [];
    let prev = label.box.bottom;
    for (const l of cands) {
      if (l.box.top - prev > 1.6 * h) break;
      if (labelOf(l)) break;
      out.push(l);
      prev = l.box.bottom;
      if (out.length >= max) break;
    }
    return out;
  }
  /** Renglón alineado a la izquierda justo arriba (domicilio sin etiqueta legible). */
  above(line) {
    const { h } = this;
    return this.lines.filter((l) => l !== line && l.box.bottom <= line.box.top + 0.4 * h && line.box.top - l.box.bottom <= 1.6 * h && Math.abs(l.box.left - line.box.left) <= 2.5 * h && !labelOf(l)).sort((a, b) => b.box.top - a.box.top)[0];
  }
  /** Primer renglón a la derecha de la etiqueta, en la misma altura. */
  right(label) {
    const { h } = this;
    const cy = (label.box.top + label.box.bottom) / 2;
    return this.lines.filter((l) => l !== label && l.box.left >= label.box.right - 0.2 * h && Math.abs((l.box.top + l.box.bottom) / 2 - cy) <= 0.6 * h).sort((a, b) => a.box.left - b.box.left)[0];
  }
  /** Valor de una etiqueta de un solo dato: mismo renglón → a la derecha → debajo. */
  value(key) {
    const label = this.find(key);
    if (!label) return null;
    const rest = matchLabel(label.n, LABELS[key]);
    if (rest) return rest;
    const r = this.right(label);
    if (r && !labelOf(r)) return r.n;
    return this.below(label, 1)[0]?.n ?? null;
  }
};
var DATE_RE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;
function printedDate(s) {
  const m = s?.replace(/\s*\/\s*/g, "/").replace(/\b(\d)\s+(\d)(?=\/)/g, "$1$2").match(DATE_RE);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > (/* @__PURE__ */ new Date()).getUTCFullYear() - 15) return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = /* @__PURE__ */ new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso ? null : iso;
}
var yymmdd = (iso) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
function pick(geo, key, valid, scanLine) {
  for (const g of geo) {
    const v = g.value(key)?.replace(/\s+/g, "");
    if (v && valid(v)) return { value: v, ambiguous: false };
  }
  const all = new Set(geo.flatMap((g) => g.lines.flatMap((l) => scanLine(l.n))).filter(valid));
  if (all.size === 1) return { value: [...all][0], ambiguous: false };
  return { value: null, ambiguous: all.size > 1 };
}
var INT_WORDS = /* @__PURE__ */ new Set(["INT", "INT.", "INTERIOR", "DEPTO", "DEPTO.", "DPTO", "DPTO.", "DEP", "DEP."]);
var C_TYPES = /* @__PURE__ */ new Set(["CDA", "CJON", "CTO", "CTRA", "CARR", "CALZ", "CERR"]);
var STREET_TYPES = /* @__PURE__ */ new Set(["C", "CALLE", "AV", "AVE", "BLVD", "PRIV", "PROL", "AND", ...C_TYPES]);
var EXT_RE = /^(\d{1,5}[A-Z]?|S\/N|SN)$/;
function parseStreet(n) {
  if (/\b(MZ|MZA|LT|LOTE|MANZANA|KM)\b/.test(n)) return null;
  const t = n.split(" ");
  let int;
  if (t.length >= 4 && INT_WORDS.has(t[t.length - 2])) {
    int = t.pop();
    t.pop();
  }
  const ext = t.pop();
  if (!ext || !EXT_RE.test(ext) || t.length === 0) return null;
  if (t.length > 2 && t[0].length === 1 && STREET_TYPES.has(t[1])) t.shift();
  if (t[0] === "C" && t.length > 1) t.shift();
  else if (/^C[BCDFGJKMNPQSTVWXYZ][A-ZÑ]{2,}$/.test(t[0]) && !C_TYPES.has(t[0])) t[0] = t[0].slice(1);
  if (/^\d/.test(t[t.length - 1])) return null;
  const street = t.join(" ");
  if (!/[A-ZÑ]{2}/.test(street)) return null;
  return { street, ext: ext === "SN" ? "S/N" : ext, int };
}
function parseAddress(lines) {
  const cpIdx = lines.findLastIndex((n, i) => i >= 1 && /\b\d{5}$/.test(n));
  if (cpIdx < 0) return "sin-cp";
  const cp = lines[cpIdx].match(/(\d{5})$/)[1];
  const colonia = lines[cpIdx].replace(/\s*\d{5}$/, "").replace(/^COL(ONIA)?\.?\s+/, "").trim();
  const munLine = lines[cpIdx + 1];
  let municipality = null;
  let state = null;
  if (munLine) {
    const comma = munLine.lastIndexOf(",");
    const [mun, st] = comma >= 0 ? [munLine.slice(0, comma), munLine.slice(comma + 1)] : [munLine.split(" ").slice(0, -1).join(" "), munLine.split(" ").at(-1) ?? ""];
    state = stateFromAbbr(st);
    if (state && /^[A-ZÑ][A-ZÑ .]+$/.test(mun.trim())) municipality = mun.trim().replace(/\.$/, "");
  }
  const streetLine = lines.slice(0, cpIdx).join(" ");
  return { cp, cpState: stateForPostalCode(cp), colonia, municipality, state, streetLine, street: streetLine ? parseStreet(streetLine) : null };
}
function readAddress(g) {
  const label = g.find("domicilio");
  if (label) {
    const inline = matchLabel(label.n, LABELS.domicilio);
    return parseAddress([...inline ? [inline] : [], ...g.below(label, 4).map((l) => l.n)]);
  }
  for (const l of g.lines) {
    if (!/\b\d{5}$/.test(l.n)) continue;
    const street = g.above(l), mun = g.below(l, 1)[0];
    if (!street || !mun) continue;
    const a = parseAddress([street.n, l.n, mun.n]);
    if (a !== "sin-cp" && a.cpState && a.state === a.cpState) return a;
  }
  return null;
}
function parseIne(obs, opts = {}) {
  const geo = obs.pages.map((p) => new PageGeo(pageLines(p).map((l) => ({ raw: l.text, n: normOcr(l.text), box: l.box }))));
  const allN = geo.flatMap((g) => g.lines.map((l) => l.n));
  const warnings = [];
  const fields = [];
  const add = (key, value, confidence, evidence) => {
    if (value && value.trim()) fields.push({ key, value: value.trim(), confidence, evidence });
  };
  const mrz = parseMrz(obs.pages.flatMap((p) => mrzRowTexts(pageLines(p)))) ?? parseMrz(allN);
  const labelsFound = ["nombre", "domicilio", "clave", "curp", "fecha", "sexo"].filter((k) => geo.some((g) => g.find(k))).length;
  const header = allN.some((n) => /ELECTORAL|CREDENCIAL PARA VOTAR/.test(n));
  const detected = Boolean(mrz) || labelsFound >= 2 || header && labelsFound >= 1 || Boolean(opts.docTypeIsIne) && labelsFound >= 1;
  if (!detected) return { detected: false, fields: [], warnings: [] };
  const tokens = (n) => n.split(" ");
  const curpPick = pick(geo, "curp", isValidCurp, (n) => [...tokens(n), n.replace(/\s+/g, "")].flatMap((t) => t.match(/[A-Z0-9]{18}/g) ?? []));
  const curp = curpPick.value;
  if (curpPick.ambiguous) warnings.push("Se leyeron varias CURP posibles: no se eligi\xF3 ninguna.");
  const curpRaw = geo.map((g) => g.value("curp")?.replace(/\s+/g, "")).find((v) => v && v.length >= 16);
  if (!curp && curpRaw) warnings.push("La CURP le\xEDda no pasa la validaci\xF3n (alg\xFAn car\xE1cter dudoso): no se us\xF3. Capt\xFArala a mano.");
  const keyPick = pick(geo, "clave", isValidVoterKey, tokens);
  const voterKey = keyPick.value;
  let printed = null;
  for (const g of geo) printed ?? (printed = printedDate(g.value("fecha")));
  if (!printed) {
    const dates = new Set(allN.map((n) => printedDate(n)).filter((d) => Boolean(d)));
    if (dates.size === 1) printed = [...dates][0];
  }
  let printedSex = null;
  for (const g of geo) {
    const v = g.value("sexo") ?? g.lines.find((l) => /^SEXO[HM]$/.test(l.n.replace(/\s+/g, "")))?.n.replace(/\s+/g, "").slice(4);
    if (v === "H") printedSex ?? (printedSex = "male");
    else if (v === "M") printedSex ?? (printedSex = "female");
  }
  const dateSources = [];
  if (printed) dateSources.push(["impresa", yymmdd(printed)]);
  if (curp) dateSources.push(["CURP", yymmdd(curpBirthDate(curp))]);
  if (voterKey) dateSources.push(["clave de elector", voterKeyBirthYYMMDD(voterKey)]);
  if (mrz) dateSources.push(["reverso (MRZ)", mrz.birthYYMMDD]);
  const dateAgree = new Set(dateSources.map((d) => d[1])).size <= 1 && !(printed && curp && curpBirthDate(curp) !== printed);
  const sexSources = [];
  if (printedSex) sexSources.push(["impreso", printedSex]);
  if (curp && curpSex(curp)) sexSources.push(["CURP", curpSex(curp)]);
  if (voterKey) sexSources.push(["clave de elector", voterKeySex(voterKey)]);
  if (mrz?.sex) sexSources.push(["reverso (MRZ)", mrz.sex]);
  const sexAgree = new Set(sexSources.map((d) => d[1])).size <= 1;
  if (mrz?.repaired) warnings.push("El reverso (MRZ) tra\xEDa letras y n\xFAmeros confundidos (O/0, I/1\u2026): se corrigieron y los d\xEDgitos verificadores los confirman.");
  if (!dateAgree) warnings.push(`La fecha de nacimiento no coincide entre ${dateSources.map((d) => d[0]).join(", ")}: rev\xEDsala contra la credencial.`);
  if (!sexAgree) warnings.push(`El sexo no coincide entre ${sexSources.map((d) => d[0]).join(", ")}: rev\xEDsalo.`);
  const corroborated = (n, agree) => agree && n >= 2 ? "medium" : "low";
  if (curp) add("curp", curp, corroborated(Math.max(dateSources.length, sexSources.length), dateAgree && sexAgree), "OCR en el dispositivo \xB7 CURP con d\xEDgito verificador v\xE1lido");
  if (voterKey) add("voter_key", voterKey, corroborated(dateSources.length, dateAgree && sexAgree), "OCR en el dispositivo \xB7 etiqueta CLAVE DE ELECTOR");
  if (printed) add("birth_date", printed, corroborated(dateSources.length, dateAgree), "OCR en el dispositivo \xB7 FECHA DE NACIMIENTO");
  else if (dateAgree && dateSources.length >= 2) {
    add("birth_date", curp ? curpBirthDate(curp) : null, "medium", "Codificada en la CURP, coincide con otra fuente");
  }
  if (sexSources.length) {
    const sex = printedSex ?? (sexAgree && sexSources.length >= 2 ? sexSources[0][1] : null);
    add("gender", sex, corroborated(sexSources.length, sexAgree), "OCR en el dispositivo \xB7 SEXO");
  }
  const mrzName = mrz && mrz.surnames.length >= 1 && mrz.givenNames.length >= 1 && mrz.surnames.length <= 2 ? { paternal: mrz.surnames[0], maternal: mrz.surnames[1] ?? null, given: mrz.givenNames.join(" ") } : null;
  const asMrz = (s) => (s ?? "").replace(/Ñ/g, "N").replace(/[^A-Z]/g, "");
  const sameGiven = (given) => asMrz(given) === asMrz(mrzName.given) || Boolean(mrz?.nameTruncated && asMrz(given).startsWith(asMrz(mrzName.given)));
  const sameAsMrz = (n) => mrzName ? asMrz(n.paternal) === asMrz(mrzName.paternal) && asMrz(n.maternal) === asMrz(mrzName.maternal) && sameGiven(n.given) : null;
  const readings = [];
  let nameWarning = null;
  for (const g of geo) {
    const label = g.find("nombre");
    if (!label) continue;
    const inline = matchLabel(label.n, LABELS.nombre);
    const lines = [...inline ? [inline] : [], ...g.below(label, 4).map((l) => l.n)];
    if (!lines.length) continue;
    const bad = lines.slice(0, 3).some((n) => !isNameLine(n));
    if (bad) {
      nameWarning ?? (nameWarning = "El nombre le\xEDdo tiene n\xFAmeros o s\xEDmbolos: no se us\xF3. Capt\xFAralo a mano.");
      continue;
    }
    if (lines.length >= 3) {
      const cand = { paternal: lines[0], maternal: lines[1], given: lines.slice(2).join(" ") };
      if (lines.length === 3 || curp && curpMatchesName(curp, cand)) readings.push(cand);
      else nameWarning ?? (nameWarning = "El nombre ocupa m\xE1s de tres renglones: capt\xFAralo a mano.");
    } else if (lines.length === 2 && curp && curp[2] === "X") {
      readings.push({ paternal: lines[0], maternal: null, given: lines[1] });
    } else {
      nameWarning ?? (nameWarning = "No se pudo distinguir apellidos y nombre(s).");
    }
  }
  let front = readings[0] ?? null;
  const nameDisagree = new Set(readings.map((n) => [n.paternal, n.maternal, n.given].map(asMrz).join("<"))).size > 1;
  for (const g of front ? [] : geo) {
    for (const l of g.lines) {
      const rest = isNameLine(l.n) && !labelOf(l) ? g.below(l, 2).map((x) => x.n) : [];
      if (rest.length < 2 || !rest.every(isNameLine)) continue;
      const cand = { paternal: l.n, maternal: rest[0], given: rest[1] };
      if (curp && curpMatchesName(curp, cand) || sameAsMrz(cand) && !mrz?.nameRepaired) {
        front = cand;
        break;
      }
    }
    if (front) break;
  }
  if (!front && nameWarning) warnings.push(nameWarning);
  let nameConf = "low";
  let name = front;
  if (front) {
    const curpOk = curp ? curpMatchesName(curp, front) : null;
    const same = sameAsMrz(front);
    const mrzOk = same && mrz?.nameRepaired ? null : same;
    if (curpOk === false) warnings.push("El nombre no coincide con las iniciales de la CURP: revisa el orden de apellidos.");
    if (mrzOk === false) warnings.push("El nombre del frente no coincide con el del reverso.");
    if (nameDisagree) warnings.push("El nombre se ley\xF3 distinto en dos lecturas de la foto: rev\xEDsalo.");
    nameConf = curpOk !== false && mrzOk !== false && (curpOk || mrzOk) && !nameDisagree ? "medium" : "low";
  } else if (mrzName && mrzName.paternal && [mrzName.paternal, mrzName.maternal ?? "X", mrzName.given].every((x) => isNameLine(x))) {
    name = mrzName;
    nameConf = curp && curpMatchesName(curp, mrzName) ? "medium" : "low";
    if (mrz?.nameRepaired) warnings.push("El nombre del reverso tra\xEDa caracteres dudosos y se corrigi\xF3: rev\xEDsalo contra la credencial.");
    else if (mrz?.nameTruncated) warnings.push("El nombre del reverso llena todo el rengl\xF3n: el \xFAltimo nombre pudo quedar cortado. Rev\xEDsalo contra la credencial.");
  }
  if (name) {
    const [first, ...middle] = name.given.split(" ");
    add("paternal_last_name", name.paternal, nameConf, "OCR en el dispositivo \xB7 NOMBRE");
    add("maternal_last_name", name.maternal, nameConf, "OCR en el dispositivo \xB7 NOMBRE");
    add("first_name", first, nameConf, "OCR en el dispositivo \xB7 NOMBRE");
    add("middle_name", middle.join(" "), nameConf, "OCR en el dispositivo \xB7 NOMBRE");
  }
  const addresses = geo.map(readAddress).filter((a) => a !== null);
  const found = addresses.filter((a) => a !== "sin-cp");
  const score = (a) => (a.cpState && a.state === a.cpState ? 4 : 0) + (a.street ? 2 : 0) + (a.municipality ? 1 : 0);
  const addr = found.sort((a, b) => score(b) - score(a))[0];
  if (!addr && addresses.length) warnings.push("No se encontr\xF3 el c\xF3digo postal en el domicilio.");
  if (addr) {
    const { cp, cpState, state } = addr;
    const cpDisagree = new Set(found.map((a) => a.cp)).size > 1;
    const poorRead = !curp && !front;
    const cpOk = Boolean(cpState && state && cpState === state) && !cpDisagree && !poorRead;
    if (cpDisagree) warnings.push("El c\xF3digo postal se ley\xF3 distinto en dos lecturas de la foto: rev\xEDsalo.");
    if (cpState && state && cpState !== state) warnings.push("El c\xF3digo postal no corresponde al estado le\xEDdo: revisa el domicilio.");
    if (!cpState) warnings.push("El c\xF3digo postal le\xEDdo no existe: no se us\xF3.");
    const conf = cpOk ? "medium" : "low";
    if (cpState) add("postal_code", cp, conf, "OCR en el dispositivo \xB7 DOMICILIO");
    if (/[A-ZÑ]{3}/.test(addr.colonia)) add("neighborhood", addr.colonia, conf, "OCR en el dispositivo \xB7 DOMICILIO");
    add("municipality", addr.municipality, conf, "OCR en el dispositivo \xB7 DOMICILIO");
    add("state", state, conf, "OCR en el dispositivo \xB7 DOMICILIO");
    if (addr.street) {
      add("street", addr.street.street, conf, "OCR en el dispositivo \xB7 DOMICILIO");
      add("exterior_number", addr.street.ext, conf, "OCR en el dispositivo \xB7 DOMICILIO");
      add("interior_number", addr.street.int, conf, "OCR en el dispositivo \xB7 DOMICILIO");
    } else if (addr.streetLine) warnings.push("La calle y n\xFAmero no se pudieron separar con seguridad: capt\xFAralos a mano.");
  }
  return { detected: true, fields, warnings, mrz };
}
export {
  isNameLine,
  normOcr,
  parseIne
};
