/**
 * Detección determinista de montos y porcentajes en texto en español (MX).
 *
 * Se usa en dos direcciones:
 *  - extraer lo que dice el cliente ("tengo 80 mil de enganche");
 *  - auditar lo que Sofía está por decir (ningún monto puede salir de la nada).
 */
import { normalize } from "./text";

export interface Mention {
  value: number;
  raw: string;
  index: number;
  end: number;
}

const UNITS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900,
};

export const NUMBER_WORDS = Object.keys(UNITS);
const WORD = NUMBER_WORDS.join("|");
// "ochenta mil", "ciento cincuenta mil", "treinta y cinco mil"
const WORD_THOUSANDS = new RegExp(`\\b((?:(?:${WORD})(?:\\s+y\\s+|\\s+)?)+)\\s*mil\\b`, "g");

export function wordsToNumber(words: string): number | null {
  const tokens = words
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t && t !== "y");
  if (tokens.length === 0) return null;
  let total = 0;
  for (const token of tokens) {
    const v = UNITS[token];
    if (v === undefined) return null;
    total += v;
  }
  return total;
}

function parseLocaleNumber(raw: string): number {
  const cleaned = raw.replace(/\s/g, "");
  // "7,412.35" → miles con coma; "7,5" → decimal con coma (poco común).
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) return Number(cleaned.replace(/,/g, ""));
  if (/^\d+,\d{1,2}$/.test(cleaned)) return Number(cleaned.replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/\./g, ""));
  return Number(cleaned.replace(/,/g, ""));
}

function pushMention(list: Mention[], m: Mention) {
  if (!Number.isFinite(m.value) || m.value <= 0) return;
  list.push(m);
}

function dedupe(list: Mention[]): Mention[] {
  const sorted = [...list].sort((a, b) => a.index - b.index || b.end - b.index - (a.end - a.index));
  const out: Mention[] = [];
  for (const m of sorted) {
    const last = out[out.length - 1];
    if (last && m.index < last.end) {
      // Traslape: nos quedamos con la coincidencia más larga.
      if (m.end - m.index > last.end - last.index) out[out.length - 1] = m;
      continue;
    }
    out.push(m);
  }
  return out;
}

/**
 * Montos de dinero mencionados. Se consideran dinero:
 *  - cualquier cifra con "$";
 *  - "80 mil", "80k", "1.2 millones", "ochenta mil";
 *  - cifras con separador de miles ("80,000");
 *  - números de 5+ dígitos, o 4 dígitos seguidos de "pesos"/"mxn".
 * Años (p. ej. "2026") sin "$" no cuentan como dinero.
 */
export function parseMoneyMentions(text: string): Mention[] {
  const found: Mention[] = [];
  const lower = text.toLowerCase();

  const withMultiplier =
    /(\$\s?)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?)\s?(mil\b|k\b|millones\b|millon\b|millón\b|mdp\b)/gi;
  for (const m of lower.matchAll(withMultiplier)) {
    const base = parseLocaleNumber(m[2]!);
    const unit = m[3]!;
    const mult = unit.startsWith("mil") && !unit.startsWith("mill") ? 1_000 : unit === "k" ? 1_000 : 1_000_000;
    pushMention(found, { value: Math.round(base * mult * 100) / 100, raw: m[0], index: m.index!, end: m.index! + m[0].length });
  }

  const dollar = /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
  for (const m of lower.matchAll(dollar)) {
    pushMention(found, { value: parseLocaleNumber(m[1]!), raw: m[0], index: m.index!, end: m.index! + m[0].length });
  }

  const thousandsSep = /\b\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b/g;
  for (const m of lower.matchAll(thousandsSep)) {
    pushMention(found, { value: parseLocaleNumber(m[0]), raw: m[0], index: m.index!, end: m.index! + m[0].length });
  }

  const bigBare = /\b\d{5,9}(?:\.\d{1,2})?\b/g;
  for (const m of lower.matchAll(bigBare)) {
    pushMention(found, { value: Number(m[0]), raw: m[0], index: m.index!, end: m.index! + m[0].length });
  }

  const fourDigitsPesos = /\b(\d{4})(?:\.\d{1,2})?\s?(pesos|mxn)\b/g;
  for (const m of lower.matchAll(fourDigitsPesos)) {
    pushMention(found, { value: Number(m[1]), raw: m[0], index: m.index!, end: m.index! + m[0].length });
  }

  // Números con letra ("ochenta mil"). Trabajamos sobre el texto normalizado,
  // que tiene la misma longitud salvo acentos combinados; basta como índice aproximado.
  const norm = normalize(text);
  for (const m of norm.matchAll(WORD_THOUSANDS)) {
    const n = wordsToNumber(m[1]!.trim());
    if (n !== null) pushMention(found, { value: n * 1_000, raw: m[0], index: m.index!, end: m.index! + m[0].length });
  }
  if (/\bun millon\b/.test(norm)) {
    const idx = norm.indexOf("un millon");
    pushMention(found, { value: 1_000_000, raw: "un millón", index: idx, end: idx + 9 });
  }

  return dedupe(found);
}

/** Porcentajes mencionados ("13.9%", "10 por ciento"). */
export function parsePercentMentions(text: string): Mention[] {
  const found: Mention[] = [];
  const re = /(\d+(?:[.,]\d+)?)\s?(%|por ciento)/gi;
  for (const m of text.matchAll(re)) {
    pushMention(found, {
      value: Number(m[1]!.replace(",", ".")),
      raw: m[0],
      index: m.index!,
      end: m.index! + m[0].length,
    });
  }
  return dedupe(found);
}

/** ¿Dos montos son "el mismo" dato? Tolera redondeo (p. ej. $7,412.35 ≈ $7,412). */
export function amountsMatch(a: number, b: number): boolean {
  const tolerance = Math.max(1, 0.006 * Math.max(Math.abs(a), Math.abs(b)));
  return Math.abs(a - b) <= tolerance;
}

export function percentsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.051;
}

export function formatMXN(value: number): string {
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return `$${value.toLocaleString("es-MX", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}

export function formatPercent(rateFraction: number): string {
  return `${(Math.round(rateFraction * 10_000) / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })}%`;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
