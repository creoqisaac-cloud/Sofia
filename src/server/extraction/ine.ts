/**
 * IneParser v1 — credencial para votar (INE/IFE) a partir de la observación de OCR del dispositivo.
 *
 * Usa ETIQUETAS + GEOMETRÍA RELATIVA (qué renglones quedan debajo o a la derecha de cada etiqueta),
 * no posiciones fijas ni un string plano. Reglas:
 *  - nunca acepta nombre/apellido con dígitos o símbolos;
 *  - nunca da confianza alta (máximo "medium", y solo si otra fuente independiente lo respalda);
 *  - CURP: estructura + dígito verificador + cruce con fecha/sexo/clave/iniciales; nunca se reconstruye;
 *  - MRZ del reverso: las confusiones O/0, I/1… se corrigen solo donde el formato exige dígito o letra y
 *    solo si los dígitos verificadores cuadran; si hubo corrección, se avisa;
 *  - si dos fuentes se contradicen, el dato baja a confianza baja y se avisa;
 *  - si falta evidencia, el dato se deja vacío (el parser puede devolver nada).
 * Todo lo que sale de aquí entra como OBSERVADO; Mario confirma/corrige/ignora.
 * Los avisos no incluyen valores (no hay PII en notas de log).
 */
import type { Confidence, ExtractedField } from "./index";
import { curpBirthDate, curpMatchesName, curpSex, isValidCurp, isValidVoterKey, mrzRowTexts, parseMrz, stateForPostalCode, stateFromAbbr, voterKeyBirthYYMMDD, voterKeySex, type MrzData } from "./mx-id";
import { pageLines, type DocumentObservation, type ObsBox } from "./observation";

export interface IneParseResult {
  /** ¿Parece una credencial INE/IFE? */
  detected: boolean;
  fields: ExtractedField[];
  warnings: string[];
  /** MRZ del reverso validada por dígitos verificadores (incluye el vencimiento = vigencia). */
  mrz?: MrzData | null;
}

interface L {
  raw: string;
  n: string; // normalizado: mayúsculas, sin acentos (Ñ se conserva), espacios colapsados
  box: ObsBox;
}

export const normOcr = (s: string) =>
  s
    .toUpperCase()
    .replace(/Ñ/g, "\u0000")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\u0000/g, "Ñ")
    .replace(/\s+/g, " ")
    .trim();

function lev(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

// Etiquetas de la credencial. "stop" = marca el fin de un bloque de valores (nombre, domicilio).
const LABELS = {
  nombre: "NOMBRE",
  domicilio: "DOMICILIO",
  clave: "CLAVE DE ELECTOR",
  curp: "CURP",
  fecha: "FECHA DE NACIMIENTO",
  sexo: "SEXO",
  registro: "AÑO DE REGISTRO",
  seccion: "SECCION",
  vigencia: "VIGENCIA",
  emision: "EMISION",
  estado: "ESTADO",
  municipio: "MUNICIPIO",
  localidad: "LOCALIDAD",
  edad: "EDAD",
} as const;
type LabelKey = keyof typeof LABELS;

/** Si el renglón empieza con la etiqueta (tolerando errores menores de OCR), devuelve el resto. */
function matchLabel(n: string, label: string): string | null {
  const tokens = n.split(" ");
  const target = label.replace(/\s+/g, "");
  const tol = target.length >= 12 ? 2 : target.length >= 6 ? 1 : 0;
  const maxK = Math.min(tokens.length, label.split(" ").length + 1);
  for (let k = 1; k <= maxK; k++) {
    if (lev(tokens.slice(0, k).join(""), target) <= tol) return tokens.slice(k).join(" ");
  }
  return null;
}

const labelOf = (l: L): LabelKey | null => (Object.keys(LABELS) as LabelKey[]).find((k) => matchLabel(l.n, LABELS[k]) !== null) ?? null;

const NON_NAME = new Set(["INSTITUTO NACIONAL ELECTORAL", "INSTITUTO FEDERAL ELECTORAL", "MEXICO", "ESTADOS UNIDOS MEXICANOS", "CREDENCIAL PARA VOTAR", "FIRMA", "MUESTRA"]);
const NAME_LINE = /^[A-ZÑ]+(?:\.?[ '-][A-ZÑ]+)*\.?$/;
/** Un renglón de nombre solo tiene letras (nunca dígitos ni símbolos). */
export const isNameLine = (n: string) => NAME_LINE.test(n) && n.length >= 2 && n.length <= 40 && !NON_NAME.has(n);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
}

class PageGeo {
  lines: L[];
  h: number;
  constructor(lines: L[]) {
    this.lines = lines;
    this.h = Math.max(1, median(lines.map((l) => l.box.bottom - l.box.top)));
  }
  find(key: LabelKey): L | undefined {
    return this.lines.find((l) => matchLabel(l.n, LABELS[key]) !== null);
  }
  /** Renglones alineados a la izquierda debajo de la etiqueta, contiguos, hasta otra etiqueta. */
  below(label: L, max: number): L[] {
    const { h } = this;
    const cands = this.lines
      .filter((l) => l !== label && l.box.top > label.box.top + 0.4 * h && Math.abs(l.box.left - label.box.left) <= 2.5 * h)
      .sort((a, b) => a.box.top - b.box.top);
    const out: L[] = [];
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
  above(line: L): L | undefined {
    const { h } = this;
    return this.lines
      .filter((l) => l !== line && l.box.bottom <= line.box.top + 0.4 * h && line.box.top - l.box.bottom <= 1.6 * h && Math.abs(l.box.left - line.box.left) <= 2.5 * h && !labelOf(l))
      .sort((a, b) => b.box.top - a.box.top)[0];
  }
  /** Primer renglón a la derecha de la etiqueta, en la misma altura. */
  right(label: L): L | undefined {
    const { h } = this;
    const cy = (label.box.top + label.box.bottom) / 2;
    return this.lines
      .filter((l) => l !== label && l.box.left >= label.box.right - 0.2 * h && Math.abs((l.box.top + l.box.bottom) / 2 - cy) <= 0.6 * h)
      .sort((a, b) => a.box.left - b.box.left)[0];
  }
  /** Valor de una etiqueta de un solo dato: mismo renglón → a la derecha → debajo. */
  value(key: LabelKey): string | null {
    const label = this.find(key);
    if (!label) return null;
    const rest = matchLabel(label.n, LABELS[key]);
    if (rest) return rest;
    const r = this.right(label);
    if (r && !labelOf(r)) return r.n;
    return this.below(label, 1)[0]?.n ?? null;
  }
}

const DATE_RE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;
function printedDate(s: string | null | undefined): string | null {
  // El OCR mete espacios junto a las diagonales o entre dígitos de la fecha ("0 7/04/ 2005").
  const m = s?.replace(/\s*\/\s*/g, "/").replace(/\b(\d)\s+(\d)(?=\/)/g, "$1$2").match(DATE_RE);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > new Date().getUTCFullYear() - 15) return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso ? null : iso;
}
const yymmdd = (iso: string) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);

/** Busca un valor válido: primero junto a su etiqueta; si no, el ÚNICO candidato válido de la página. */
function pick(geo: PageGeo[], key: LabelKey, valid: (v: string) => boolean, scanLine: (n: string) => string[]): { value: string | null; ambiguous: boolean } {
  for (const g of geo) {
    const v = g.value(key)?.replace(/\s+/g, "");
    if (v && valid(v)) return { value: v, ambiguous: false };
  }
  const all = new Set(geo.flatMap((g) => g.lines.flatMap((l) => scanLine(l.n))).filter(valid));
  if (all.size === 1) return { value: [...all][0]!, ambiguous: false };
  return { value: null, ambiguous: all.size > 1 };
}

const INT_WORDS = new Set(["INT", "INT.", "INTERIOR", "DEPTO", "DEPTO.", "DPTO", "DPTO.", "DEP", "DEP."]);
// Abreviaturas de vialidad que empiezan con "C" + consonante (no son una "C" de calle pegada).
const C_TYPES = new Set(["CDA", "CJON", "CTO", "CTRA", "CARR", "CALZ", "CERR"]);
// Tipos de vialidad con que empieza el renglón de la calle.
const STREET_TYPES = new Set(["C", "CALLE", "AV", "AVE", "BLVD", "PRIV", "PROL", "AND", ...C_TYPES]);
const EXT_RE = /^(\d{1,5}[A-Z]?|S\/N|SN)$/;

function parseStreet(n: string): { street: string; ext: string; int?: string } | null {
  if (/\b(MZ|MZA|LT|LOTE|MANZANA|KM)\b/.test(n)) return null; // formatos con manzana/lote: captura manual
  const t = n.split(" ");
  let int: string | undefined;
  if (t.length >= 4 && INT_WORDS.has(t[t.length - 2]!)) {
    int = t.pop();
    t.pop();
  }
  const ext = t.pop();
  if (!ext || !EXT_RE.test(ext) || t.length === 0) return null;
  // Orilla de la credencial o sombra leída como un caracter suelto antes del tipo de vialidad ("1 C VALLE…", "| C VALLE…").
  if (t.length > 2 && t[0]!.length === 1 && STREET_TYPES.has(t[1]!)) t.shift();
  if (t[0] === "C" && t.length > 1) t.shift(); // "C" = calle
  // "CFALSA": el OCR pegó la "C" de calle (en español ninguna palabra empieza con C + B, D, F, G, J…)
  else if (/^C[BCDFGJKMNPQSTVWXYZ][A-ZÑ]{2,}$/.test(t[0]!) && !C_TYPES.has(t[0]!)) t[0] = t[0]!.slice(1);
  if (/^\d/.test(t[t.length - 1]!)) return null; // dos números seguidos: ambiguo
  const street = t.join(" ");
  if (!/[A-ZÑ]{2}/.test(street)) return null;
  return { street, ext: ext === "SN" ? "S/N" : ext, int };
}

interface Address {
  cp: string;
  cpState: string | null;
  colonia: string;
  municipality: string | null;
  state: string | null;
  streetLine: string;
  street: { street: string; ext: string; int?: string } | null;
}

/** Domicilio en renglones: calle y número · colonia + CP · municipio, estado. */
function parseAddress(lines: string[]): Address | "sin-cp" {
  const cpIdx = lines.findLastIndex((n, i) => i >= 1 && /\b\d{5}$/.test(n));
  if (cpIdx < 0) return "sin-cp";
  const cp = lines[cpIdx]!.match(/(\d{5})$/)![1]!;
  const colonia = lines[cpIdx]!
    .replace(/\s*\d{5}$/, "")
    .replace(/^COL(ONIA)?\.?\s+/, "")
    .trim();
  const munLine = lines[cpIdx + 1];
  let municipality: string | null = null;
  let state: string | null = null;
  if (munLine) {
    const comma = munLine.lastIndexOf(",");
    const [mun, st] = comma >= 0 ? [munLine.slice(0, comma), munLine.slice(comma + 1)] : [munLine.split(" ").slice(0, -1).join(" "), munLine.split(" ").at(-1) ?? ""];
    state = stateFromAbbr(st);
    if (state && /^[A-ZÑ][A-ZÑ .]+$/.test(mun.trim())) municipality = mun.trim().replace(/\.$/, "");
  }
  const streetLine = lines.slice(0, cpIdx).join(" ");
  return { cp, cpState: stateForPostalCode(cp), colonia, municipality, state, streetLine, street: streetLine ? parseStreet(streetLine) : null };
}

/**
 * Domicilio de una lectura: debajo de la etiqueta DOMICILIO; si la etiqueta no se leyó (letra chica y
 * pálida), el renglón "COLONIA CP" cuyo renglón de abajo es un estado que CORRESPONDE a ese CP.
 */
function readAddress(g: PageGeo): Address | "sin-cp" | null {
  const label = g.find("domicilio");
  if (label) {
    const inline = matchLabel(label.n, LABELS.domicilio);
    return parseAddress([...(inline ? [inline] : []), ...g.below(label, 4).map((l) => l.n)]);
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

export function parseIne(obs: DocumentObservation, opts: { docTypeIsIne?: boolean } = {}): IneParseResult {
  const geo = obs.pages.map((p) => new PageGeo(pageLines(p).map((l) => ({ raw: l.text, n: normOcr(l.text), box: l.box }))));
  const allN = geo.flatMap((g) => g.lines.map((l) => l.n));
  const warnings: string[] = [];
  const fields: ExtractedField[] = [];
  const add = (key: string, value: string | null | undefined, confidence: Confidence, evidence: string) => {
    if (value && value.trim()) fields.push({ key, value: value.trim(), confidence, evidence });
  };

  // La MRZ se busca por renglón (ML Kit puede partir un renglón de letras muy espaciadas en pedazos).
  const mrz: MrzData | null = parseMrz(obs.pages.flatMap((p) => mrzRowTexts(pageLines(p)))) ?? parseMrz(allN);
  const labelsFound = (["nombre", "domicilio", "clave", "curp", "fecha", "sexo"] as LabelKey[]).filter((k) => geo.some((g) => g.find(k))).length;
  const header = allN.some((n) => /ELECTORAL|CREDENCIAL PARA VOTAR/.test(n));
  const detected = Boolean(mrz) || labelsFound >= 2 || (header && labelsFound >= 1) || (Boolean(opts.docTypeIsIne) && labelsFound >= 1);
  if (!detected) return { detected: false, fields: [], warnings: [] };

  // ── CURP y clave de elector ──
  const tokens = (n: string) => n.split(" ");
  const curpPick = pick(geo, "curp", isValidCurp, (n) => [...tokens(n), n.replace(/\s+/g, "")].flatMap((t) => t.match(/[A-Z0-9]{18}/g) ?? []));
  const curp = curpPick.value;
  if (curpPick.ambiguous) warnings.push("Se leyeron varias CURP posibles: no se eligió ninguna.");
  const curpRaw = geo.map((g) => g.value("curp")?.replace(/\s+/g, "")).find((v) => v && v.length >= 16);
  if (!curp && curpRaw) warnings.push("La CURP leída no pasa la validación (algún carácter dudoso): no se usó. Captúrala a mano.");
  const keyPick = pick(geo, "clave", isValidVoterKey, tokens);
  const voterKey = keyPick.value;

  // ── Fecha de nacimiento y sexo impresos ──
  let printed: string | null = null;
  for (const g of geo) printed ??= printedDate(g.value("fecha"));
  if (!printed) {
    const dates = new Set(allN.map((n) => printedDate(n)).filter((d): d is string => Boolean(d)));
    if (dates.size === 1) printed = [...dates][0]!;
  }
  let printedSex: "male" | "female" | null = null;
  for (const g of geo) {
    const v = g.value("sexo") ?? g.lines.find((l) => /^SEXO[HM]$/.test(l.n.replace(/\s+/g, "")))?.n.replace(/\s+/g, "").slice(4);
    if (v === "H") printedSex ??= "male";
    else if (v === "M") printedSex ??= "female";
  }

  // Fuentes independientes de fecha/sexo
  const dateSources: Array<[string, string]> = []; // [fuente, AAMMDD]
  if (printed) dateSources.push(["impresa", yymmdd(printed)]);
  if (curp) dateSources.push(["CURP", yymmdd(curpBirthDate(curp)!)]);
  if (voterKey) dateSources.push(["clave de elector", voterKeyBirthYYMMDD(voterKey)]);
  if (mrz) dateSources.push(["reverso (MRZ)", mrz.birthYYMMDD]);
  // AAMMDD en todas las fuentes y, entre CURP e impresa, la fecha completa (el siglo sale de la CURP).
  const dateAgree = new Set(dateSources.map((d) => d[1])).size <= 1 && !(printed && curp && curpBirthDate(curp) !== printed);

  const sexSources: Array<[string, "male" | "female"]> = [];
  if (printedSex) sexSources.push(["impreso", printedSex]);
  if (curp && curpSex(curp)) sexSources.push(["CURP", curpSex(curp)!]);
  if (voterKey) sexSources.push(["clave de elector", voterKeySex(voterKey)]);
  if (mrz?.sex) sexSources.push(["reverso (MRZ)", mrz.sex]);
  const sexAgree = new Set(sexSources.map((d) => d[1])).size <= 1;

  if (mrz?.repaired) warnings.push("El reverso (MRZ) traía letras y números confundidos (O/0, I/1…): se corrigieron y los dígitos verificadores los confirman.");
  if (!dateAgree) warnings.push(`La fecha de nacimiento no coincide entre ${dateSources.map((d) => d[0]).join(", ")}: revísala contra la credencial.`);
  if (!sexAgree) warnings.push(`El sexo no coincide entre ${sexSources.map((d) => d[0]).join(", ")}: revísalo.`);

  const corroborated = (n: number, agree: boolean): Confidence => (agree && n >= 2 ? "medium" : "low");

  if (curp) add("curp", curp, corroborated(Math.max(dateSources.length, sexSources.length), dateAgree && sexAgree), "OCR en el dispositivo · CURP con dígito verificador válido");
  if (voterKey) add("voter_key", voterKey, corroborated(dateSources.length, dateAgree && sexAgree), "OCR en el dispositivo · etiqueta CLAVE DE ELECTOR");
  if (printed) add("birth_date", printed, corroborated(dateSources.length, dateAgree), "OCR en el dispositivo · FECHA DE NACIMIENTO");
  else if (dateAgree && dateSources.length >= 2) {
    // Sin fecha impresa legible: solo si dos fuentes independientes (p. ej. CURP y MRZ) coinciden.
    add("birth_date", curp ? curpBirthDate(curp) : null, "medium", "Codificada en la CURP, coincide con otra fuente");
  }
  if (sexSources.length) {
    const sex = printedSex ?? (sexAgree && sexSources.length >= 2 ? sexSources[0]![1] : null);
    add("gender", sex, corroborated(sexSources.length, sexAgree), "OCR en el dispositivo · SEXO");
  }

  // ── Nombre ── (si hay varias lecturas de la misma cara, se usa la primera que dé un nombre limpio; si otra
  // da un nombre distinto, se avisa)
  const mrzName = mrz && mrz.surnames.length >= 1 && mrz.givenNames.length >= 1 && mrz.surnames.length <= 2
    ? { paternal: mrz.surnames[0]!, maternal: mrz.surnames[1] ?? null, given: mrz.givenNames.join(" ") }
    : null;
  const asMrz = (s: string | null) => (s ?? "").replace(/Ñ/g, "N").replace(/[^A-Z]/g, "");
  // Con el renglón lleno (30 caracteres) la MRZ pudo recortar el último nombre: basta con que sea su inicio.
  const sameGiven = (given: string) => asMrz(given) === asMrz(mrzName!.given) || Boolean(mrz?.nameTruncated && asMrz(given).startsWith(asMrz(mrzName!.given)));
  const sameAsMrz = (n: { paternal: string; maternal: string | null; given: string }) =>
    mrzName ? asMrz(n.paternal) === asMrz(mrzName.paternal) && asMrz(n.maternal) === asMrz(mrzName.maternal) && sameGiven(n.given) : null;
  const readings: Array<{ paternal: string; maternal: string | null; given: string }> = [];
  let nameWarning: string | null = null;
  for (const g of geo) {
    const label = g.find("nombre");
    if (!label) continue;
    const inline = matchLabel(label.n, LABELS.nombre);
    const lines = [...(inline ? [inline] : []), ...g.below(label, 4).map((l) => l.n)];
    if (!lines.length) continue;
    const bad = lines.slice(0, 3).some((n) => !isNameLine(n));
    if (bad) {
      nameWarning ??= "El nombre leído tiene números o símbolos: no se usó. Captúralo a mano.";
      continue;
    }
    if (lines.length >= 3) {
      const cand = { paternal: lines[0]!, maternal: lines[1]!, given: lines.slice(2).join(" ") };
      if (lines.length === 3 || (curp && curpMatchesName(curp, cand))) readings.push(cand);
      else nameWarning ??= "El nombre ocupa más de tres renglones: captúralo a mano.";
    } else if (lines.length === 2 && curp && curp[2] === "X") {
      readings.push({ paternal: lines[0]!, maternal: null, given: lines[1]! });
    } else {
      nameWarning ??= "No se pudo distinguir apellidos y nombre(s).";
    }
  }
  let front = readings[0] ?? null;
  // Dos lecturas de la misma cara con distinto nombre: una letra mal leída que la CURP (solo revisa iniciales) no delata.
  const nameDisagree = new Set(readings.map((n) => [n.paternal, n.maternal, n.given].map(asMrz).join("<"))).size > 1;
  // Sin etiqueta NOMBRE legible (es la letra más chica y pálida): tres renglones seguidos de solo letras,
  // alineados, y SOLO si la CURP o el reverso (sin correcciones) confirman ese nombre.
  for (const g of front ? [] : geo) {
    for (const l of g.lines) {
      const rest = isNameLine(l.n) && !labelOf(l) ? g.below(l, 2).map((x) => x.n) : [];
      if (rest.length < 2 || !rest.every(isNameLine)) continue;
      const cand = { paternal: l.n, maternal: rest[0]!, given: rest[1]! };
      if ((curp && curpMatchesName(curp, cand)) || (sameAsMrz(cand) && !mrz?.nameRepaired)) {
        front = cand;
        break;
      }
    }
    if (front) break;
  }
  if (!front && nameWarning) warnings.push(nameWarning);
  let nameConf: Confidence = "low";
  let name = front;
  if (front) {
    const curpOk = curp ? curpMatchesName(curp, front) : null;
    const same = sameAsMrz(front);
    // El renglón del nombre no tiene dígito verificador: si hubo que corregirlo, no cuenta como respaldo.
    const mrzOk = same && mrz?.nameRepaired ? null : same;
    if (curpOk === false) warnings.push("El nombre no coincide con las iniciales de la CURP: revisa el orden de apellidos.");
    if (mrzOk === false) warnings.push("El nombre del frente no coincide con el del reverso.");
    if (nameDisagree) warnings.push("El nombre se leyó distinto en dos lecturas de la foto: revísalo.");
    nameConf = curpOk !== false && mrzOk !== false && (curpOk || mrzOk) && !nameDisagree ? "medium" : "low";
  } else if (mrzName && mrzName.paternal && [mrzName.paternal, mrzName.maternal ?? "X", mrzName.given].every((x) => isNameLine(x))) {
    name = mrzName;
    nameConf = curp && curpMatchesName(curp, mrzName) ? "medium" : "low";
    if (mrz?.nameRepaired) warnings.push("El nombre del reverso traía caracteres dudosos y se corrigió: revísalo contra la credencial.");
    else if (mrz?.nameTruncated) warnings.push("El nombre del reverso llena todo el renglón: el último nombre pudo quedar cortado. Revísalo contra la credencial.");
  }
  if (name) {
    const [first, ...middle] = name.given.split(" ");
    add("paternal_last_name", name.paternal, nameConf, "OCR en el dispositivo · NOMBRE");
    add("maternal_last_name", name.maternal, nameConf, "OCR en el dispositivo · NOMBRE");
    add("first_name", first, nameConf, "OCR en el dispositivo · NOMBRE");
    add("middle_name", middle.join(" "), nameConf, "OCR en el dispositivo · NOMBRE");
  }

  // ── Domicilio ── (de varias lecturas se usa la más coherente: CP ↔ estado, calle y municipio)
  const addresses = geo.map(readAddress).filter((a): a is Address | "sin-cp" => a !== null);
  const found = addresses.filter((a): a is Address => a !== "sin-cp");
  const score = (a: Address) => (a.cpState && a.state === a.cpState ? 4 : 0) + (a.street ? 2 : 0) + (a.municipality ? 1 : 0);
  const addr = found.sort((a, b) => score(b) - score(a))[0];
  if (!addr && addresses.length) warnings.push("No se encontró el código postal en el domicilio.");
  if (addr) {
    const { cp, cpState, state } = addr;
    // Dos lecturas de la misma foto con distinto CP: un dígito mal leído que el estado no delata.
    const cpDisagree = new Set(found.map((a) => a.cp)).size > 1;
    // Foto tan mala que no dejó leer ni la CURP ni el nombre del frente: CP ↔ estado solo revisa los dos
    // primeros dígitos, así que un dígito mal leído pasaría sin aviso. El domicilio se queda en confianza baja.
    const poorRead = !curp && !front;
    const cpOk = Boolean(cpState && state && cpState === state) && !cpDisagree && !poorRead;
    if (cpDisagree) warnings.push("El código postal se leyó distinto en dos lecturas de la foto: revísalo.");
    if (cpState && state && cpState !== state) warnings.push("El código postal no corresponde al estado leído: revisa el domicilio.");
    if (!cpState) warnings.push("El código postal leído no existe: no se usó.");
    const conf: Confidence = cpOk ? "medium" : "low";
    if (cpState) add("postal_code", cp, conf, "OCR en el dispositivo · DOMICILIO");
    if (/[A-ZÑ]{3}/.test(addr.colonia)) add("neighborhood", addr.colonia, conf, "OCR en el dispositivo · DOMICILIO");
    add("municipality", addr.municipality, conf, "OCR en el dispositivo · DOMICILIO");
    add("state", state, conf, "OCR en el dispositivo · DOMICILIO");
    if (addr.street) {
      add("street", addr.street.street, conf, "OCR en el dispositivo · DOMICILIO");
      add("exterior_number", addr.street.ext, conf, "OCR en el dispositivo · DOMICILIO");
      add("interior_number", addr.street.int, conf, "OCR en el dispositivo · DOMICILIO");
    } else if (addr.streetLine) warnings.push("La calle y número no se pudieron separar con seguridad: captúralos a mano.");
  }

  return { detected: true, fields, warnings, mrz };
}
