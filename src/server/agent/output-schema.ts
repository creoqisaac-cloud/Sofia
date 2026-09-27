/**
 * Contrato de salida del cerebro de Sofía.
 *
 * El LLM solo devuelve PROPUESTAS con esta forma. Nada de aquí toca la base
 * de datos directamente: el backend valida cada campo (vocabulario cerrado,
 * anclaje a evidencia, reglas de transición, políticas de aprobación).
 *
 * Todos los campos son requeridos (con null/[] cuando no aplican) para que
 * funcione con structured outputs de la API de Claude.
 */
import { z } from "zod";
import {
  ACTION_TOOLS,
  CRM_STAGES,
  ESCALATION_TRIGGERS,
  INFO_STATUSES,
  NEXT_ACTION_TYPES,
  TEMPERATURES,
} from "@/domain/enums";
import { FACT_KEYS } from "@/domain/facts";

export const KNOWLEDGE_REF_TYPES = [
  "knowledge_item",
  "commercial_offer",
  "promotion_rule",
  "financing_rule",
  "insurance_rule",
  "quote_template",
  "quote",
  "vehicle_version",
] as const;
export type KnowledgeRefType = (typeof KNOWLEDGE_REF_TYPES)[number];

export const ObservedFactSchema = z.object({
  key: z.enum(FACT_KEYS).describe("Clave del dato del perfil."),
  value: z.string().describe("Valor normalizado en texto. Para enums usar el valor exacto permitido."),
  numeric_value: z.number().nullable().describe("Valor numérico si aplica (montos en pesos, meses, personas)."),
  evidence: z.string().describe("Cita textual del mensaje del CLIENTE que respalda el dato."),
  confidence: z.enum(["high", "medium", "low"]),
});

export const RequestedToolSchema = z.object({
  tool: z.enum(ACTION_TOOLS),
  reason: z.string(),
  arguments: z.object({
    requested_window: z.string().nullable().describe("Día/horario que pidió el cliente, en sus palabras."),
    document_type: z.string().nullable(),
    amount: z.number().nullable().describe("Monto solicitado por el cliente (p. ej. descuento pedido)."),
    note: z.string().nullable(),
  }),
});

export const AgentOutputSchema = z.object({
  customer_reply: z
    .string()
    .describe("Mensaje de WhatsApp para el cliente, en español de México, breve y natural."),
  observed_facts: z.array(ObservedFactSchema),
  tags_proposed: z.array(z.object({ tag: z.string(), reason: z.string() })),
  stage_proposal: z.object({ stage: z.enum(CRM_STAGES), reason: z.string() }).nullable(),
  temperature_proposal: z.object({ temperature: z.enum(TEMPERATURES), reason: z.string() }).nullable(),
  next_action: z.object({ type: z.enum(NEXT_ACTION_TYPES), description: z.string() }),
  requires_mario: z.boolean(),
  escalation_reason: z
    .object({
      trigger: z.enum(ESCALATION_TRIGGERS),
      explanation: z.string(),
      recommended_next_step: z.string(),
    })
    .nullable(),
  requires_approval: z.boolean(),
  requested_tools: z.array(RequestedToolSchema),
  knowledge_used: z.array(
    z.object({
      ref_type: z.enum(KNOWLEDGE_REF_TYPES),
      ref_id: z.string(),
      status_presented: z.enum(INFO_STATUSES),
    }),
  ),
  summary_update: z
    .string()
    .nullable()
    .describe("Resumen acumulado actualizado del cliente (máx. ~600 caracteres), o null si no cambia."),
  pending_items: z.array(z.string()).nullable().describe("Lista completa y actualizada de pendientes, o null si no cambia."),
  mario_commitments_observed: z
    .array(z.object({ text: z.string(), source_message_id: z.string() }))
    .describe("Compromisos que MARIO hizo en sus propios mensajes (nunca inventados)."),
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;
export type ObservedFact = z.infer<typeof ObservedFactSchema>;
export type RequestedTool = z.infer<typeof RequestedToolSchema>;
