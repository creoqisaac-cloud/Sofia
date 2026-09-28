/**
 * Análisis determinista de una solicitud y plan de llenado del PDF.
 *
 *  - Solo datos CONFIRMADOS se autocompletan.
 *  - Datos observados (p. ej. dichos en conversación) requieren confirmación de Mario.
 *  - Datos en conflicto NUNCA se autocompletan.
 *  - HUMAN_CONFIRMATION y SIGNATURE nunca entran al plan de llenado.
 */
import type { CreditApplicationStatus } from "../enums";
import { FACT_DEFS, isFactKey } from "../facts";
import type { ApplicationSlot, CreditAdapter } from "./types";

export interface FieldStateLite {
  status: "confirmed" | "observed" | "conflicting" | "missing";
  value: unknown;
  factId: string | null;
  sourceLabel: string | null;
}
export type FieldStates = Record<string, FieldStateLite | undefined>;

export type SlotCategory =
  | "confirmed"
  | "needs_confirmation"
  | "conflict"
  | "missing"
  | "optional"
  | "not_applicable"
  | "human"
  | "signature";

export interface SlotAnalysis {
  slot: ApplicationSlot;
  category: SlotCategory;
  applicable: boolean;
  /** Claves del perfil que faltan/están en conflicto/por confirmar. */
  blockingKeys: string[];
  /** Valor transformado listo para el PDF (solo si category = confirmed). */
  value: string | null;
  checked: boolean | null;
  factIds: string[];
  sourceLabels: string[];
}

export interface SectionSummary {
  id: string;
  label: string;
  required: number;
  complete: number;
  missing: number;
  conflicts: number;
  needsConfirmation: number;
  human: number;
  signatures: number;
}

export interface ApplicationAnalysis {
  slots: SlotAnalysis[];
  sections: SectionSummary[];
  totals: {
    confirmed: number;
    missing: number;
    conflicts: number;
    needsConfirmation: number;
    optional: number;
    notApplicable: number;
    human: number;
    signatures: number;
  };
  /** Claves del perfil a completar / confirmar / resolver (sin duplicados). */
  missingKeys: string[];
  conflictKeys: string[];
  confirmKeys: string[];
  suggestedStatus: Extract<CreditApplicationStatus, "missing_information" | "conflict" | "ready_for_review">;
}

function conditionApplies(slot: ApplicationSlot, states: FieldStates): boolean {
  const c = slot.condition;
  if (!c) return true;
  const st = states[c.profileKey];
  // La condición solo se considera cumplida con un dato vigente (confirmado u observado).
  if (!st || (st.status !== "confirmed" && st.status !== "observed")) return false;
  if (c.equals !== undefined) return String(st.value) === c.equals;
  if (c.lessThan !== undefined) return typeof st.value === "number" && st.value < c.lessThan;
  return true;
}

const foldUpper = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

/** ¿La casilla corresponde al valor del perfil? `checkedWhen` admite alternativas "a|b". */
export function checkboxMatches(checkedWhen: string | undefined, value: unknown): boolean {
  if (!checkedWhen) return false;
  return checkedWhen.split("|").some((c) => foldUpper(c) === foldUpper(value));
}

export function transformValue(slot: ApplicationSlot, values: unknown[]): string {
  const keys = slot.profileKeys ?? [];
  const parts = values.map((v, i) => {
    const key = keys[i]!;
    if (v === null || v === undefined || v === "") return "";
    switch (slot.transform) {
      case "date_dd":
        return String(v).split("-")[2] ?? "";
      case "date_mm":
        return String(v).split("-")[1] ?? "";
      case "date_yyyy":
        return String(v).split("-")[0] ?? "";
      case "date_ddmmyyyy": {
        const [y, m, d] = String(v).split("-");
        return y && m && d ? `${d}/${m}/${y}` : String(v);
      }
      case "money":
        return typeof v === "number" ? v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v);
      case "phone10":
        return String(v).replace(/\D/g, "").slice(-10);
      case "int":
        return String(Math.round(Number(v)));
      case "enum_label": {
        const def = isFactKey(key) ? FACT_DEFS[key] : undefined;
        return (def?.enumLabels?.[String(v)] ?? String(v)).toUpperCase();
      }
      case "upper":
        return String(v).toUpperCase();
      default:
        return String(v);
    }
  });
  return parts.filter(Boolean).join(" ").trim();
}

export function analyzeApplication(adapter: CreditAdapter, states: FieldStates): ApplicationAnalysis {
  const slots: SlotAnalysis[] = adapter.slots.map((slot) => {
    const base = { slot, applicable: true, blockingKeys: [] as string[], value: null as string | null, checked: null as boolean | null, factIds: [] as string[], sourceLabels: [] as string[] };
    if (slot.class === "HUMAN_CONFIRMATION") return { ...base, category: "human" as const };
    if (slot.class === "SIGNATURE") {
      const applicable = conditionApplies(slot, states);
      return { ...base, applicable, category: applicable ? ("signature" as const) : ("not_applicable" as const) };
    }
    const applicable = conditionApplies(slot, states);
    if (!applicable) return { ...base, applicable: false, category: "not_applicable" as const };
    const keys = slot.profileKeys ?? [];
    if (keys.length === 0) {
      // Condicional sin fuente en el perfil (p. ej. datos del coacreditado): se captura aparte.
      return { ...base, category: "missing" as const, blockingKeys: [] };
    }
    // Para slots compuestos, el primer componente es el requerido; los demás son opcionales (p. ej. segundo nombre).
    const primary = keys[0]!;
    const primaryState = states[primary];
    const componentStates = keys.map((k) => states[k]);
    const conflicts = keys.filter((k) => states[k]?.status === "conflicting");
    if (conflicts.length) return { ...base, category: "conflict" as const, blockingKeys: conflicts };
    if (!primaryState || primaryState.status === "missing") {
      return { ...base, category: slot.class === "AUTO_FILL" ? ("optional" as const) : ("missing" as const), blockingKeys: [primary] };
    }
    const unconfirmed = keys.filter((k) => states[k]?.status === "observed");
    if (unconfirmed.length) return { ...base, category: "needs_confirmation" as const, blockingKeys: unconfirmed };
    const confirmedStates = componentStates.filter((s): s is FieldStateLite => Boolean(s && s.status === "confirmed"));
    const values = keys.map((k) => (states[k]?.status === "confirmed" ? states[k]!.value : null));
    const factIds = confirmedStates.map((s) => s.factId).filter((x): x is string => Boolean(x));
    const sourceLabels = Array.from(new Set(confirmedStates.map((s) => s.sourceLabel).filter((x): x is string => Boolean(x))));
    if (slot.pdfType === "checkbox") {
      return { ...base, category: "confirmed" as const, checked: checkboxMatches(slot.checkedWhen, primaryState.value), factIds, sourceLabels };
    }
    return { ...base, category: "confirmed" as const, value: transformValue(slot, values), factIds, sourceLabels };
  });

  const sections: SectionSummary[] = adapter.sections.map(({ id, label }) => {
    const inSection = slots.filter((s) => s.slot.section === id);
    const required = inSection.filter((s) => s.applicable && (s.slot.class === "ASK_IF_MISSING" || s.slot.class === "CONDITIONAL"));
    return {
      id,
      label,
      required: required.length,
      complete: required.filter((s) => s.category === "confirmed").length,
      missing: inSection.filter((s) => s.category === "missing").length,
      conflicts: inSection.filter((s) => s.category === "conflict").length,
      needsConfirmation: inSection.filter((s) => s.category === "needs_confirmation").length,
      human: inSection.filter((s) => s.category === "human").length,
      signatures: inSection.filter((s) => s.category === "signature").length,
    };
  });

  const count = (c: SlotCategory) => slots.filter((s) => s.category === c).length;
  const uniq = (c: SlotCategory) => Array.from(new Set(slots.filter((s) => s.category === c).flatMap((s) => s.blockingKeys)));
  const totals = {
    confirmed: count("confirmed"),
    missing: count("missing"),
    conflicts: count("conflict"),
    needsConfirmation: count("needs_confirmation"),
    optional: count("optional"),
    notApplicable: count("not_applicable"),
    human: count("human"),
    signatures: count("signature"),
  };
  return {
    slots,
    sections,
    totals,
    missingKeys: uniq("missing"),
    conflictKeys: uniq("conflict"),
    confirmKeys: uniq("needs_confirmation"),
    suggestedStatus: totals.conflicts > 0 ? "conflict" : totals.missing + totals.needsConfirmation > 0 ? "missing_information" : "ready_for_review",
  };
}

export interface FillInstruction {
  slot: string;
  pdfField: string;
  pdfType: "text" | "checkbox";
  value: string | null;
  checked: boolean | null;
  profileKeys: string[];
  factIds: string[];
  sourceLabels: string[];
}

export interface FillPlan {
  fill: FillInstruction[];
  skipped: Array<{ slot: string; reason: string }>;
}

/**
 * Plan de llenado: SOLO slots confirmados de datos. Garantías:
 * HUMAN_CONFIRMATION y SIGNATURE jamás se incluyen, aunque tengan mapeo.
 */
export function buildFillPlan(analysis: ApplicationAnalysis, fieldMapping: Record<string, string>): FillPlan {
  const fill: FillInstruction[] = [];
  const skipped: FillPlan["skipped"] = [];
  for (const s of analysis.slots) {
    const cls = s.slot.class;
    if (cls === "HUMAN_CONFIRMATION") {
      skipped.push({ slot: s.slot.slot, reason: "human_confirmation" });
      continue;
    }
    if (cls === "SIGNATURE") {
      skipped.push({ slot: s.slot.slot, reason: "signature" });
      continue;
    }
    if (s.category !== "confirmed") {
      skipped.push({ slot: s.slot.slot, reason: s.category });
      continue;
    }
    const pdfField = fieldMapping[s.slot.slot];
    if (!pdfField) {
      skipped.push({ slot: s.slot.slot, reason: "unmapped" });
      continue;
    }
    if (s.slot.pdfType === "checkbox" && !s.checked) {
      skipped.push({ slot: s.slot.slot, reason: "checkbox_not_selected" });
      continue;
    }
    fill.push({
      slot: s.slot.slot,
      pdfField,
      pdfType: s.slot.pdfType,
      value: s.value,
      checked: s.checked,
      profileKeys: s.slot.profileKeys ?? [],
      factIds: s.factIds,
      sourceLabels: s.sourceLabels,
    });
  }
  return { fill, skipped };
}
