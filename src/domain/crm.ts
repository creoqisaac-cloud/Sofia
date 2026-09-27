/**
 * Reglas deterministas de CRM. La IA solo *propone* etapa y temperatura;
 * aquí se decide si el cambio es válido.
 */
import type { ActorType, CrmStage, Temperature } from "./enums";
import { CRM_STAGE_LABELS } from "./enums";

/** Orden del embudo. Cita y prueba de manejo son laterales (pueden ocurrir en cualquier momento). */
const STAGE_ORDER: Record<CrmStage, number> = {
  new: 0,
  profiling: 1,
  quotation: 2,
  financing: 3,
  documentation: 4,
  application: 5,
  credit: 6,
  appointment: -10,
  test_drive: -10,
  negotiation: 7,
  closing: 8,
  sold: 9,
  follow_up: -20,
  not_interested: -30,
};

const LATERAL: CrmStage[] = ["appointment", "test_drive"];
const PARKING: CrmStage[] = ["follow_up", "not_interested"];
/** Etapas que solo Mario (o el sistema por un evento real) pueden fijar. */
const MARIO_ONLY: CrmStage[] = ["sold"];

export type TransitionResult = { ok: true; noop: boolean } | { ok: false; reason: string };

export function stageOrder(stage: CrmStage): number {
  return STAGE_ORDER[stage];
}

export function validateStageTransition(from: CrmStage, to: CrmStage, actor: ActorType): TransitionResult {
  if (from === to) return { ok: true, noop: true };
  if (actor === "mario") return { ok: true, noop: false };
  if (MARIO_ONLY.includes(to)) {
    return { ok: false, reason: `Solo Mario puede marcar la etapa "${CRM_STAGE_LABELS[to]}".` };
  }
  if (from === "sold") return { ok: false, reason: "El cliente ya está marcado como vendido; solo Mario puede cambiarlo." };
  if (PARKING.includes(to) || PARKING.includes(from)) return { ok: true, noop: false };
  if (LATERAL.includes(to)) {
    // Una cita o prueba de manejo no hace retroceder a un cliente que ya negocia o cierra.
    if (STAGE_ORDER[from] >= STAGE_ORDER.negotiation) {
      return { ok: false, reason: `El cliente ya está en "${CRM_STAGE_LABELS[from]}"; la cita se registra sin cambiar la etapa.` };
    }
    return { ok: true, noop: false };
  }
  if (LATERAL.includes(from)) return { ok: true, noop: false };
  if (STAGE_ORDER[to] >= STAGE_ORDER[from]) return { ok: true, noop: false };
  return {
    ok: false,
    reason: `Retroceso de "${CRM_STAGE_LABELS[from]}" a "${CRM_STAGE_LABELS[to]}" no permitido sin intervención de Mario.`,
  };
}

export function validateTemperatureChange(from: Temperature, to: Temperature, reason: string): TransitionResult {
  if (from === to) return { ok: true, noop: true };
  if (!reason.trim()) return { ok: false, reason: "Todo cambio de temperatura requiere un motivo." };
  return { ok: true, noop: false };
}
