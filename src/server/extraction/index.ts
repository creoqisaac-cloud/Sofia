/**
 * Extracción de datos de documentos — SIN IA por defecto y SIN simular.
 *
 * Proveedores (se intentan en orden; todos devuelven valores OBSERVADOS, nunca confirmados):
 *  1. acroform  — PDF de solicitud BBVA/Banorte llenado (campos AcroForm reales). Confianza alta.
 *  2. pdf-text  — PDF con capa de texto (constancias, estados de cuenta digitales):
 *                 solo patrones inequívocos (CURP, RFC, correo). Confianza media.
 *  0. on-device — OCR hecho en la tablet (ML Kit, APK) que llega junto con el archivo:
 *                 INE → IneParser (etiquetas + geometría + validaciones cruzadas); otros → patrones.
 *                 Nunca confianza alta. Cero tokens: no pasa por ningún servicio de IA.
 *  3. externo   — visión/OCR de un servicio externo: interfaz lista, NO configurado (ver docs).
 *
 * Fotos (JPG/PNG) y PDFs escaneados SIN observación del dispositivo: no hay OCR en el servidor →
 * el documento queda "needs_review" y Mario captura a mano (flujo manual completo).
 */
import { PDFDocument } from "pdf-lib";
import { getAdapter } from "@/domain/credit";
import { isFactKey } from "@/domain/facts";
import { extractProfileEntries } from "../credit/import";
import { inspectPdfFields, matchesRealMapping, realMapping } from "../credit/pdf";
import { parseIne } from "./ine";
import { isValidCurp } from "./mx-id";
import { observationText, type DocumentObservation } from "./observation";

export type Confidence = "high" | "medium" | "low";

export interface ExtractedField {
  key: string;
  value: string;
  confidence: Confidence;
  evidence: string;
}

export interface ExtractionResult {
  provider: string;
  fields: ExtractedField[];
  /** ¿Se pudo leer el contenido? (false = escaneado/imagen sin OCR) */
  readable: boolean;
  note: string;
}

export interface ExtractionInput {
  bytes: Uint8Array;
  mime: string;
  docType: string;
  /** OCR estructurado hecho en el dispositivo (APK). Opcional. */
  observation?: DocumentObservation;
}

export interface ExtractionProvider {
  readonly name: string;
  /** local = determinista en el servidor; external = servicio de visión/IA (cuenta en métricas de IA). */
  readonly kind: "local" | "external";
  readonly configured: boolean;
  supports(mime: string): boolean;
  extract(input: ExtractionInput): Promise<ExtractionResult | null>;
}

const isPdf = (mime: string) => mime === "application/pdf";

export const acroformProvider: ExtractionProvider = {
  name: "acroform",
  kind: "local",
  configured: true,
  supports: isPdf,
  async extract({ bytes }) {
    let fields;
    try {
      fields = await inspectPdfFields(bytes);
    } catch {
      return null;
    }
    if (!fields.length) return null;
    for (const code of ["BBVA", "BANORTE"]) {
      const adapter = getAdapter(code)!;
      if (!matchesRealMapping(adapter, fields)) continue;
      const { entries, skipped } = await extractProfileEntries(bytes, adapter, realMapping(adapter));
      return {
        provider: "acroform",
        readable: true,
        fields: entries.map((e) => ({ key: e.key, value: e.value, confidence: "high" as const, evidence: `Campo del formulario ${adapter.institutionName}` })),
        note: `Solicitud ${adapter.institutionName} llenada: ${entries.length} dato(s) leídos de sus campos.${skipped.length ? ` ${skipped.length} campo(s) compuestos no se separan a ciegas (domicilio).` : ""}`,
      };
    }
    return null;
  },
};

const PATTERNS: Array<{ key: string; re: RegExp; label: string; valid?: (v: string) => boolean }> = [
  { key: "curp", re: /\b[A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d\b/g, label: "patrón CURP" },
  { key: "rfc", re: /\b[A-ZÑ&]{4}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[A-Z0-9]{3}\b/g, label: "patrón RFC (persona física)" },
  { key: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, label: "patrón de correo" },
];

export const pdfTextProvider: ExtractionProvider = {
  name: "pdf-text",
  kind: "local",
  configured: true,
  supports: isPdf,
  async extract({ bytes }) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    let text = "";
    try {
      const pdf = await getDocumentProxy(bytes.slice());
      text = String((await extractText(pdf, { mergePages: true })).text ?? "");
    } catch {
      return { provider: "pdf-text", fields: [], readable: false, note: "No se pudo leer el PDF." };
    }
    if (text.replace(/\s/g, "").length < 20) return { provider: "pdf-text", fields: [], readable: false, note: "PDF escaneado (sin texto): requiere OCR. Captura los datos a mano." };
    const { fields, ambiguous } = patternFields(text, "medium", "Texto del PDF");
    const note = fields.length
      ? `Encontré ${fields.length} dato(s) por patrón en el texto.${ambiguous.length ? ` Hay varios valores posibles de ${ambiguous.join(", ")}: no se eligió ninguno.` : ""}`
      : `El PDF tiene texto pero no encontré datos con patrón inequívoco${ambiguous.length ? ` (varios valores de ${ambiguous.join(", ")})` : ""}. Captura a mano lo que necesites.`;
    return { provider: "pdf-text", fields, readable: true, note };
  },
};

/** Patrones inequívocos sobre un texto (CURP, RFC, correo); si hay varios valores, no elige ninguno. */
function patternFields(text: string, confidence: Confidence, evidence: string) {
  const fields: ExtractedField[] = [];
  const ambiguous: string[] = [];
  for (const p of PATTERNS) {
    if (p.key === "email") {
      const emails = [...new Set([...text.matchAll(p.re)].map((m) => m[0].toLowerCase()))];
      if (emails.length === 1) fields.push({ key: "email", value: emails[0]!, confidence, evidence: `${evidence} (${p.label})` });
      else if (emails.length > 1) ambiguous.push("correo");
      continue;
    }
    const found = [...new Set([...text.toUpperCase().matchAll(p.re)].map((m) => m[0]))];
    if (found.length === 1) fields.push({ key: p.key, value: found[0]!, confidence, evidence: `${evidence} (${p.label})` });
    else if (found.length > 1) ambiguous.push(p.key.toUpperCase());
  }
  return { fields, ambiguous };
}

/**
 * OCR del dispositivo (ML Kit Text Recognition v2 en la APK). El servidor solo interpreta la
 * observación; no hay llamada a IA ni costo por documento.
 */
export const onDeviceOcrProvider: ExtractionProvider = {
  name: "ocr-dispositivo",
  kind: "local",
  configured: true,
  supports: () => true,
  async extract({ observation, docType }) {
    if (!observation) return null;
    const text = observationText(observation);
    if (text.replace(/\s/g, "").length < 8) return { provider: "ocr-dispositivo", fields: [], readable: true, note: "El escaneo no tiene texto legible. Captura los datos a mano o vuelve a escanear con más luz." };
    if (docType === "ine" || docType === "other") {
      const ine = parseIne(observation, { docTypeIsIne: docType === "ine" });
      if (ine.detected) {
        const head = ine.fields.length ? `INE leída en la tablet: ${ine.fields.length} dato(s) por revisar.` : "INE detectada, pero no se leyó ningún dato con seguridad. Captúralos a mano.";
        return { provider: "ocr-dispositivo", fields: ine.fields, readable: true, note: [head, ...ine.warnings].join(" ") };
      }
      if (docType === "ine") return { provider: "ocr-dispositivo", fields: [], readable: true, note: "No se reconoció una credencial INE en el escaneo. Vuelve a escanear el frente completo o captura a mano." };
    }
    const found = patternFields(text, "low", "OCR en el dispositivo");
    const ambiguous = found.ambiguous;
    // OCR dudoso: la CURP solo pasa con dígito verificador válido (nunca se corrige).
    const fields = found.fields.filter((f) => f.key !== "curp" || isValidCurp(f.value));
    const note = fields.length
      ? `Leído en la tablet: ${fields.length} dato(s) por patrón.${ambiguous.length ? ` Hay varios valores posibles de ${ambiguous.join(", ")}: no se eligió ninguno.` : ""}`
      : "Escaneo leído en la tablet, sin datos con patrón inequívoco. Captura a mano lo que necesites.";
    return { provider: "ocr-dispositivo", fields, readable: true, note };
  },
};

/**
 * Proveedor externo de visión/OCR (p. ej. Google Document AI, AWS Textract, Azure Document Intelligence,
 * o un modelo de visión). NO está configurado: se activaría con credenciales del SERVIDOR (nunca en la APK).
 * Se deja la ranura para no rehacer el flujo cuando se decida.
 */
export const externalVisionProvider: ExtractionProvider = {
  name: "external-vision",
  kind: "external",
  configured: false,
  supports: () => true,
  async extract() {
    return null;
  },
};

export const EXTRACTION_PROVIDERS: ExtractionProvider[] = [onDeviceOcrProvider, acroformProvider, pdfTextProvider, externalVisionProvider];

export async function runExtraction(input: ExtractionInput, providers: ExtractionProvider[] = EXTRACTION_PROVIDERS): Promise<ExtractionResult> {
  const notes: string[] = [];
  for (const p of providers) {
    if (!p.configured || !p.supports(input.mime)) continue;
    const r = await p.extract(input);
    if (!r) continue;
    const fields = r.fields.filter((f) => isFactKey(f.key) && f.value.trim());
    if (fields.length) return { ...r, fields };
    notes.push(r.note);
    if (!r.readable) break;
  }
  if (input.mime.startsWith("image/")) {
    return { provider: "manual", fields: [], readable: false, note: "Imagen recibida. No hay OCR configurado: revisa la foto y captura los datos a mano." };
  }
  return { provider: "manual", fields: [], readable: false, note: notes[0] ?? "Sin lectura automática disponible: captura los datos a mano." };
}

/** Valida el tipo real por la firma de bytes (no por la extensión). */
export function sniffMime(bytes: Uint8Array): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return null;
}

export async function isEncryptedPdf(bytes: Uint8Array): Promise<boolean> {
  try {
    await PDFDocument.load(bytes);
    return false;
  } catch (e) {
    return /encrypt/i.test(String(e));
  }
}
