/**
 * Política de acciones: cuáles se ejecutan automáticamente y cuáles
 * requieren aprobación de Mario antes de ocurrir.
 */
import type { ActionTool, ApprovalActionType, EscalationTrigger } from "./enums";

export type ActionDecision =
  | { decision: "auto"; reason: string }
  | { decision: "approval"; approvalType: ApprovalActionType; escalation: EscalationTrigger | null; reason: string }
  | { decision: "reject"; reason: string };

export const ACTION_POLICY: Record<ActionTool, ActionDecision> = {
  schedule_appointment: { decision: "auto", reason: "Se registra como cita *propuesta*; Mario la confirma." },
  schedule_test_drive: { decision: "auto", reason: "Se registra como prueba de manejo *propuesta*; Mario la confirma." },
  create_followup: { decision: "auto", reason: "Seguimiento interno sin impacto comercial." },
  request_document: { decision: "auto", reason: "Solicitud de un documento a la vez, según política de documentación." },
  send_document: {
    decision: "approval",
    approvalType: "send_sensitive_document",
    escalation: null,
    reason: "Enviar documentación sensible requiere aprobación de Mario.",
  },
  request_discount: {
    decision: "approval",
    approvalType: "discount_request",
    escalation: "discount_outside_rules",
    reason: "Cualquier descuento fuera de reglas confirmadas lo decide Mario.",
  },
  request_special_condition: {
    decision: "approval",
    approvalType: "outside_commercial_rules",
    escalation: "special_condition",
    reason: "Condiciones especiales requieren aprobación de Mario.",
  },
  modify_price: {
    decision: "approval",
    approvalType: "price_modification",
    escalation: "special_negotiation",
    reason: "Sofía nunca modifica precios; solo puede solicitarlo a Mario.",
  },
};

export function classifyAction(tool: ActionTool): ActionDecision {
  return ACTION_POLICY[tool];
}
