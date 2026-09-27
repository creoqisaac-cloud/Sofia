/**
 * Logger con redacción de PII. Nunca registrar cuerpos de mensajes,
 * teléfonos, correos, CURP/RFC ni referencias de documentos en claro.
 */
const PATTERNS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/gi, "[curp]"],
  [/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/gi, "[rfc]"],
  [/\+?\d[\d\s-]{8,}\d/g, "[phone]"],
];

export function redact(value: string): string {
  return PATTERNS.reduce((acc, [re, rep]) => acc.replace(re, rep), value);
}

function redactDeep(value: unknown): unknown {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        /body|text|reply|content|phone|email|storage_key|storageKey/i.test(k) ? "[omitido]" : redactDeep(v),
      ]),
    );
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

function log(level: Level, event: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({ level, event, ...(data ? (redactDeep(data) as object) : {}), at: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => log("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) => log("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => log("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => log("error", event, data),
};
