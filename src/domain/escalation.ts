/**
 * Disparadores deterministas de "🔥 MARIO, ENTRA TÚ".
 *
 * El LLM también puede proponer una escalación (p. ej. "criterio humano"),
 * pero estas reglas garantizan que los casos críticos nunca se pierdan
 * aunque el modelo no los marque.
 */
import type { CrmStage, EscalationTrigger, Temperature } from "./enums";
import type { Intent } from "./intents";

export interface EscalationSignal {
  trigger: EscalationTrigger;
  reason: string;
  recommendedNextStep: string;
}

export function detectEscalations(input: {
  intents: Set<Intent>;
  stage: CrmStage;
  temperature: Temperature;
}): EscalationSignal[] {
  const out: EscalationSignal[] = [];
  const { intents } = input;
  if (intents.has("request_mario")) {
    out.push({
      trigger: "customer_requests_mario",
      reason: "El cliente pidió hablar directamente con Mario.",
      recommendedNextStep: "Mario le escribe o le llama a la brevedad.",
    });
  }
  if (intents.has("credit_approved")) {
    out.push({
      trigger: "credit_approved",
      reason: "El cliente reporta que su crédito fue aprobado.",
      recommendedNextStep: "Confirmar la aprobación con la financiera y agendar firma/entrega.",
    });
  }
  if (intents.has("ready_to_buy")) {
    out.push({
      trigger: "ready_to_purchase",
      reason: "El cliente expresó que quiere comprar/apartar.",
      recommendedNextStep: "Mario confirma condiciones finales y agenda cierre.",
    });
  }
  if (intents.has("discount_request")) {
    out.push({
      trigger: "discount_outside_rules",
      reason: "El cliente pide un descuento o precio especial fuera de las reglas confirmadas.",
      recommendedNextStep: "Mario decide si hay margen de negociación; Sofía no promete nada.",
    });
  }
  if (intents.has("special_condition")) {
    out.push({
      trigger: "special_condition",
      reason: "El cliente pide una condición especial (enganche, auto a cuenta, forma de pago, etc.).",
      recommendedNextStep: "Mario valida si la condición es posible antes de responder.",
    });
  }
  const closingStages: CrmStage[] = ["negotiation", "closing"];
  if (closingStages.includes(input.stage) && input.temperature === "very_hot" && out.length === 0) {
    out.push({
      trigger: "approaching_closing",
      reason: "Cliente muy caliente en etapa de negociación/cierre.",
      recommendedNextStep: "Mario entra a cerrar la venta.",
    });
  }
  return out;
}
