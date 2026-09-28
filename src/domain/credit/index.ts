import { BANORTE_ADAPTER } from "./banorte";
import { BBVA_ADAPTER } from "./bbva";
import type { CreditAdapter } from "./types";

/** Registro de adaptadores. Agregar una financiera = un adaptador + una fila en credit_institutions. */
export const CREDIT_ADAPTERS: Record<string, CreditAdapter> = {
  BBVA: BBVA_ADAPTER,
  BANORTE: BANORTE_ADAPTER,
};

export function getAdapter(institutionCode: string): CreditAdapter | null {
  return CREDIT_ADAPTERS[institutionCode.toUpperCase()] ?? null;
}

/** Estados que Sofía recalcula sola; los demás (firma, envío, resolución) los fija Mario. */
export const AUTO_STATUSES = ["draft", "missing_information", "conflict", "ready_for_review"] as const;

export const MANUAL_TRANSITIONS: Record<string, string[]> = {
  draft: ["cancelled"],
  missing_information: ["cancelled"],
  conflict: ["cancelled"],
  ready_for_review: ["ready_for_signature", "cancelled"],
  ready_for_signature: ["submitted", "ready_for_review", "cancelled"],
  submitted: ["approved", "rejected", "cancelled"],
  approved: ["cancelled"],
  rejected: ["ready_for_review"],
  cancelled: ["draft"],
};

export * from "./analyze";
export * from "./types";
