/**
 * IneParser v1 — credencial para votar (INE/IFE) a partir de la observación de OCR del dispositivo.
 *
 * Usa ETIQUETAS + GEOMETRÍA RELATIVA (qué renglones quedan debajo o a la derecha de cada etiqueta),
 * no posiciones fijas ni un string plano. Reglas:
 *  - nunca acepta nombre/apellido con dígitos o símbolos;
 *  - nunca da confianza alta (máximo "medium", y solo si otra fuente independiente lo respalda);
 *  - CURP: estructura + dígito verificador + cruce con fecha/sexo/clave/iniciales; nunca se reconstruye;
 *  - si dos fuentes se contradicen, el dato baja a confianza baja y se avisa;
 *  - si falta evidencia, el dato se deja vacío (el parser puede devolver nada).
 * Todo lo que sale de aquí entra como OBSERVADO; Mario confirma/corrige/ignora.
 * Los avisos no incluyen valores (no hay PII en notas de log).
 */
import type { Confidence, ExtractedField } from "./index";
import { curpBirthDate, curpMatchesName, curpSex, isValidCurp, isValidVoterKey, parseMrz, stateForPostalCode, stateFromAbbr, voterKeyBirthYYMMDD, voterKeySex, type MrzData } from "./mx-id";
import { pageLines, type DocumentObservation, type ObsBox } from "./observation";

export interface IneParseResult {
  /** ¿Parece una credencial INE/IFE? */
  detected: boolean;
  fields: ExtractedField[];
  warnings: string[];
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
  const m = s?.match(DATE_RE);
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
  if (t[0] === "C" && t.length > 1) t.shift(); // "C" = calle
  if (/^\d/.test(t[t.length - 1]!)) return null; // dos números seguidos: ambiguo
  const street = t.join(" ");
  if (!/[A-ZÑ]{2}/.test(street)) return null;
  return { street, ext: ext === "SN" ? "S/N" : ext, int };
}

export function parseIne(obs: DocumentObservation, opts: { docTypeIsIne?: boolean } = {}): IneParseResult {
  const geo = obs.pages.map((p) => new PageGeo(pageLines(p).map((l) => ({ raw: l.text, n: normOcr(l.text), box: l.box }))));
  const allN = geo.flatMap((g) => g.lines.map((l) => l.n));
  const warnings: string[] = [];
  const fields: ExtractedField[] = [];
  const add = (key: string, value: string | null | undefined, confidence: Confidence, evidence: string) => {
    if (value && value.trim()) fields.push({ key, value: value.trim(), confidence, evidence });
  };

  const mrz: MrzData | null = parseMrz(allN);
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

  // ── Nombre ──
  let front: { paternal: string; maternal: string | null; given: string } | null = null;
  for (const g of geo) {
    const label = g.find("nombre");
    if (!label) continue;
    const inline = matchLabel(label.n, LABELS.nombre);
    const lines = [...(inline ? [inline] : []), ...g.below(label, 4).map((l) => l.n)];
    if (!lines.length) continue;
    const bad = lines.slice(0, 3).some((n) => !isNameLine(n));
    if (bad) {
      warnings.push("El nombre leído tiene números o símbolos: no se usó. Captúralo a mano.");
      break;
    }
    if (lines.length >= 3) {
      const cand = { paternal: lines[0]!, maternal: lines[1]!, given: lines.slice(2).join(" ") };
      if (lines.length === 3 || (curp && curpMatchesName(curp, cand))) front = cand;
      else warnings.push("El nombre ocupa más de tres renglones: captúralo a mano.");
    } else if (lines.length === 2 && curp && curp[2] === "X") {
      front = { paternal: lines[0]!, maternal: null, given: lines[1]! };
    } else {
      warnings.push("No se pudo distinguir apellidos y nombre(s).");
    }
    break;
  }
  const mrzName = mrz && mrz.surnames.length >= 1 && mrz.givenNames.length >= 1 && mrz.surnames.length <= 2
    ? { paternal: mrz.surnames[0]!, maternal: mrz.surnames[1] ?? null, given: mrz.givenNames.join(" ") }
    : null;
  const asMrz = (s: string | null) => (s ?? "").replace(/Ñ/g, "N").replace(/[^A-Z]/g, "");
  let nameConf: Confidence = "low";
  let name = front;
  if (front) {
    const curpOk = curp ? curpMatchesName(curp, front) : null;
    const mrzOk = mrzName ? asMrz(front.paternal) === asMrz(mrzName.paternal) && asMrz(front.maternal) === asMrz(mrzName.maternal) && asMrz(front.given) === asMrz(mrzName.given) : null;
    if (curpOk === false) warnings.push("El nombre no coincide con las iniciales de la CURP: revisa el orden de apellidos.");
    if (mrzOk === false) warnings.push("El nombre del frente no coincide con el del reverso.");
    nameConf = curpOk !== false && mrzOk !== false && (curpOk || mrzOk) ? "medium" : "low";
  } else if (mrzName && mrzName.paternal && [mrzName.paternal, mrzName.maternal ?? "X", mrzName.given].every((x) => isNameLine(x))) {
    name = mrzName;
    nameConf = curp && curpMatchesName(curp, mrzName) ? "medium" : "low";
  }
  if (name) {
    const [first, ...middle] = name.given.split(" ");
    add("paternal_last_name", name.paternal, nameConf, "OCR en el dispositivo · NOMBRE");
    add("maternal_last_name", name.maternal, nameConf, "OCR en el dispositivo · NOMBRE");
    add("first_name", first, nameConf, "OCR en el dispositivo · NOMBRE");
    add("middle_name", middle.join(" "), nameConf, "OCR en el dispositivo · NOMBRE");
  }

  // ── Domicilio ──
  for (const g of geo) {
    const label = g.find("domicilio");
    if (!label) continue;
    const inline = matchLabel(label.n, LABELS.domicilio);
    const lines = [...(inline ? [inline] : []), ...g.below(label, 4).map((l) => l.n)];
    const cpIdx = lines.findLastIndex((n, i) => i >= 1 && /\b\d{5}$/.test(n));
    if (cpIdx < 0) {
      warnings.push("No se encontró el código postal en el domicilio.");
      break;
    }
    const cp = lines[cpIdx]!.match(/(\d{5})$/)![1]!;
    const cpState = stateForPostalCode(cp);
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
    const cpOk = Boolean(cpState && state && cpState === state);
    if (cpState && state && cpState !== state) warnings.push("El código postal no corresponde al estado leído: revisa el domicilio.");
    if (!cpState) warnings.push("El código postal leído no existe: no se usó.");
    const conf: Confidence = cpOk ? "medium" : "low";
    if (cpState) add("postal_code", cp, conf, "OCR en el dispositivo · DOMICILIO");
    if (/[A-ZÑ]{3}/.test(colonia)) add("neighborhood", colonia, conf, "OCR en el dispositivo · DOMICILIO");
    add("municipality", municipality, conf, "OCR en el dispositivo · DOMICILIO");
    add("state", state, conf, "OCR en el dispositivo · DOMICILIO");
    const streetLine = lines.slice(0, cpIdx).join(" ");
    const st = streetLine ? parseStreet(streetLine) : null;
    if (st) {
      add("street", st.street, conf, "OCR en el dispositivo · DOMICILIO");
      add("exterior_number", st.ext, conf, "OCR en el dispositivo · DOMICILIO");
      add("interior_number", st.int, conf, "OCR en el dispositivo · DOMICILIO");
    } else if (streetLine) warnings.push("La calle y número no se pudieron separar con seguridad: captúralos a mano.");
    break;
  }

  return { detected: true, fields, warnings };
}
