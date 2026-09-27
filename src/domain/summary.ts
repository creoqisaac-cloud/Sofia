/**
 * Resumen determinista del cliente a partir del perfil estructurado.
 * Lo usa el motor demo y sirve de respaldo si el LLM no entrega resumen.
 */
import { CRM_STAGE_LABELS, TEMPERATURE_LABELS, type CrmStage, type Temperature } from "./enums";
import { FACT_DEFS, formatFactValue, type CustomerProfile, type FactKey } from "./facts";
import { truncate } from "./text";

export function buildDeterministicSummary(
  displayName: string,
  profile: CustomerProfile,
  stage: CrmStage,
  temperature: Temperature,
  notes: string[] = [],
): string {
  const get = (k: FactKey) => (profile[k] !== undefined ? formatFactValue(k, profile[k]!) : null);
  const who = get("name") ?? displayName;
  const vehicle = [get("vehicle_interest"), get("version")].filter(Boolean).join(" ");
  const parts: string[] = [];
  parts.push(vehicle ? `${who} está interesado(a) en ${vehicle}.` : `${who} aún no define modelo.`);
  const usage = [get("usage_type") && `uso ${get("usage_type")!.toLowerCase()}`, get("driving_profile") && `manejo en ${get("driving_profile")!.toLowerCase()}`, get("passengers") && `${get("passengers")} pasajeros`]
    .filter(Boolean)
    .join(", ");
  if (usage) parts.push(`Perfil: ${usage}.`);
  const money = [
    get("payment_method") && `pago: ${get("payment_method")!.toLowerCase()}`,
    get("down_payment") && `enganche ${get("down_payment")}`,
    get("target_monthly_payment") && `mensualidad objetivo ${get("target_monthly_payment")}`,
    get("budget") && `presupuesto ${get("budget")}`,
    get("term_months") && `plazo ${get("term_months")} meses`,
  ]
    .filter(Boolean)
    .join(", ");
  if (money) parts.push(`Finanzas: ${money}.`);
  if (get("purchase_timing")) parts.push(`Compra: ${get("purchase_timing")!.toLowerCase()}.`);
  if (get("objections")) parts.push(`Objeciones: ${get("objections")}.`);
  if (get("competitors")) parts.push(`Compara con: ${get("competitors")}.`);
  parts.push(`Etapa: ${CRM_STAGE_LABELS[stage]}, ${TEMPERATURE_LABELS[temperature].toLowerCase()}.`);
  for (const n of notes) parts.push(n);
  return truncate(parts.join(" "), 600);
}

export function labelOf(key: FactKey): string {
  return FACT_DEFS[key].label;
}
