/** Minúsculas, sin acentos (ñ se conserva) y espacios colapsados. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/ñ/g, "\u0000")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\u0000/g, "ñ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Divide un mensaje en oraciones conservando la puntuación final.
 * Suficiente para mensajes cortos tipo WhatsApp.
 */
export function splitSentences(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    current += ch;
    const next = input[i + 1];
    const isTerminator = ch === "." || ch === "!" || ch === "?" || ch === "\n";
    // No cortar decimales ni miles ("7.5", "1.2 millones").
    const isDecimalPoint = ch === "." && /\d/.test(input[i - 1] ?? "") && /\d/.test(next ?? "");
    if (isTerminator && !isDecimalPoint && (next === undefined || /\s/.test(next) || ch === "\n")) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function isQuestion(sentence: string): boolean {
  return sentence.includes("?") || sentence.includes("¿");
}

export function truncate(input: string, max: number): string {
  return input.length <= max ? input : `${input.slice(0, max - 1).trimEnd()}…`;
}

/** Escapa texto para usarlo dentro de una RegExp. */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
