/**
 * Ensamblado del prompt por capas.
 *
 * - `system`: capas estables (identidad, estilo, reglas, seguridad,
 *   herramientas, contrato de salida). Idénticas para todos los clientes →
 *   se cachean (prompt caching).
 * - `user`: capas dinámicas del turno (cliente, memoria, contexto comercial,
 *   conversación reciente, mensaje nuevo).
 */
import type { TurnContext } from "../turn-context";
import { renderCommercialContext, renderConversation, renderCustomerContext, renderMemory } from "./context";
import { CORE_IDENTITY } from "./identity";
import { OUTPUT_CONTRACT } from "./output";
import { BEHAVIOR_RULES } from "./rules";
import { SAFETY_RULES } from "./safety";
import { COMMUNICATION_STYLE } from "./style";
import { TOOL_GUIDE } from "./tools";

export interface PromptLayer {
  name: string;
  text: string;
}

export interface BuiltPrompt {
  system: PromptLayer[];
  user: PromptLayer[];
  stats: Record<string, number>;
}

export const STABLE_LAYERS: PromptLayer[] = [
  { name: "core_identity", text: CORE_IDENTITY },
  { name: "communication_style", text: COMMUNICATION_STYLE },
  { name: "behavior_rules", text: BEHAVIOR_RULES },
  { name: "safety_authorization", text: SAFETY_RULES },
  { name: "tool_definitions", text: TOOL_GUIDE },
  { name: "output_contract", text: OUTPUT_CONTRACT },
];

export function buildPrompt(ctx: TurnContext, opts: { correction?: string } = {}): BuiltPrompt {
  const user: PromptLayer[] = [
    { name: "customer_context", text: renderCustomerContext(ctx) },
    { name: "memory", text: renderMemory(ctx) },
    { name: "commercial_context", text: renderCommercialContext(ctx) },
    { name: "conversation", text: renderConversation(ctx) },
  ];
  if (opts.correction) {
    user.push({
      name: "correction",
      text: `<correction>
Tu respuesta anterior fue bloqueada por los guardrails del backend:
${opts.correction}
Reescribe customer_reply sin esos problemas. Si no tienes el dato vigente, di que lo verificas con Mario.
</correction>`,
    });
  }
  const stats: Record<string, number> = {
    system_chars: STABLE_LAYERS.reduce((n, l) => n + l.text.length, 0),
    user_chars: user.reduce((n, l) => n + l.text.length, 0),
    recent_messages: ctx.recentMessages.length,
    total_messages: ctx.totalMessages,
    knowledge_items: ctx.commercial.items.length,
  };
  return { system: STABLE_LAYERS, user, stats };
}

export function renderUserContent(prompt: BuiltPrompt): string {
  return prompt.user.map((l) => l.text).join("\n\n");
}
