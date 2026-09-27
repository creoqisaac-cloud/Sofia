/**
 * Estado efectivo de la información comercial.
 *
 * Regla: la información vencida NUNCA se presenta como vigente. Aunque en la
 * base diga "confirmed", si `valid_to` ya pasó se trata como histórica.
 */
import type { InfoStatus } from "./enums";
import { normalize } from "./text";

export interface KnowledgeMetaLike {
  status: InfoStatus;
  validFrom: Date | null;
  validTo: Date | null;
}

export interface EffectiveStatus {
  status: InfoStatus;
  expired: boolean;
  notYetValid: boolean;
  /** ¿Puede presentarse como información vigente (con su etiqueta)? */
  presentableAsCurrent: boolean;
}

const PRESENTABLE: InfoStatus[] = ["confirmed", "official_quote", "validated_quote", "estimate"];

export function effectiveStatus(meta: KnowledgeMetaLike, now: Date): EffectiveStatus {
  const expired = meta.validTo !== null && meta.validTo.getTime() < now.getTime();
  const notYetValid = meta.validFrom !== null && meta.validFrom.getTime() > now.getTime();
  let status: InfoStatus = meta.status;
  if (status !== "unknown") {
    if (expired) status = "historical";
    else if (notYetValid) status = "unknown";
  }
  return {
    status,
    expired,
    notYetValid,
    presentableAsCurrent: PRESENTABLE.includes(status) && !expired && !notYetValid,
  };
}

/** Estados con los que una regla comercial puede *aplicarse* (no solo mencionarse). */
export function isBindingRuleStatus(status: InfoStatus): boolean {
  return status === "confirmed" || status === "official_quote";
}

export interface ScopedLike {
  modelScope: string[] | null;
  versionScope: string[] | null;
}

/** ¿El dato aplica a este modelo/versión? Alcance vacío = aplica a todos. */
export function matchesScope(item: ScopedLike, model: string | null, version: string | null): boolean {
  const models = item.modelScope ?? [];
  const versions = item.versionScope ?? [];
  if (models.length > 0) {
    if (!model) return false;
    if (!models.some((m) => normalize(m) === normalize(model))) return false;
  }
  if (versions.length > 0) {
    if (!version) return false;
    if (!versions.some((v) => normalize(v) === normalize(version))) return false;
  }
  return true;
}

/** Cómo debe etiquetar Sofía un dato al mencionarlo. */
export const STATUS_PHRASES: Record<InfoStatus, string> = {
  confirmed: "información confirmada",
  official_quote: "cotización oficial",
  validated_quote: "cotización previamente validada",
  estimate: "estimación (sujeta a confirmación)",
  historical: "dato histórico, ya NO vigente",
  unknown: "no confirmado: hay que verificarlo",
};
