/**
 * Política de documentación: nunca pedir toda la documentación de crédito
 * de golpe. Se pide un documento a la vez y solo cuando el proceso lo amerita.
 */
import type { CrmStage, DocumentType } from "./enums";
import { stageOrder } from "./crm";
import { normalize } from "./text";

export const CREDIT_DOCUMENT_ORDER: DocumentType[] = [
  "ine",
  "proof_of_address",
  "proof_of_income",
  "bank_statement",
  "tax_id",
  "curp",
];

/** Máximo de tipos de documento distintos que Sofía puede mencionar como solicitud en un mensaje. */
export const MAX_DOCUMENT_TYPES_PER_MESSAGE = 2;
/** Máximo de solicitudes de documento que Sofía puede registrar por turno. */
export const MAX_DOCUMENT_REQUESTS_PER_TURN = 1;

export function documentsAllowed(stage: CrmStage, paymentMethod: string | undefined): boolean {
  if (paymentMethod === "cash") return false;
  const order = stageOrder(stage);
  return order >= stageOrder("financing") || stage === "appointment" || stage === "test_drive";
}

export function nextDocumentToRequest(
  stage: CrmStage,
  paymentMethod: string | undefined,
  existing: Array<{ docType: DocumentType; status: string }>,
): DocumentType | null {
  if (!documentsAllowed(stage, paymentMethod)) return null;
  for (const doc of CREDIT_DOCUMENT_ORDER) {
    if (!existing.some((d) => d.docType === doc && d.status !== "rejected")) return doc;
  }
  return null;
}

const DOC_PATTERNS: Array<[DocumentType, RegExp]> = [
  ["ine", /\bine\b|identificacion oficial|credencial (de elector|del ine)/],
  ["proof_of_address", /comprobante(s)? de domicilio/],
  ["proof_of_income", /comprobante(s)? de ingreso|recibos? de nomina|talon(es)? de pago/],
  ["bank_statement", /estados? de cuenta/],
  ["tax_id", /\brfc\b|constancia de situacion fiscal|csf/],
  ["curp", /\bcurp\b/],
];

/** Tipos de documento mencionados en un texto. */
export function mentionedDocumentTypes(text: string): DocumentType[] {
  const n = normalize(text);
  return DOC_PATTERNS.filter(([, re]) => re.test(n)).map(([t]) => t);
}
