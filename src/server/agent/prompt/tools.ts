/** Capa 5 — Definición de herramientas. Estable (se cachea). */
import type Anthropic from "@anthropic-ai/sdk";

/** Herramientas de SOLO LECTURA que el modelo puede invocar durante el turno. Deterministas. */
export const READ_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_commercial_info",
    description:
      "Consulta información comercial registrada (precios, bonos, promociones, financiamiento, seguros, disponibilidad, características) para un modelo. Devuelve cada dato con su estado (confirmed, estimate, historical, unknown…), fuente y vigencia. Úsala si necesitas datos de un modelo que no están en el contexto.",
    input_schema: {
      type: "object",
      properties: {
        model: { type: "string", description: "Modelo Honda, p. ej. City, HR-V, CR-V." },
        topic: {
          type: "string",
          enum: ["price", "bonus", "financing", "insurance", "availability", "features", "warranty", "documents", "general"],
        },
      },
      required: ["model", "topic"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "calculate_quote",
    description:
      "Calcula con reglas deterministas una ESTIMACIÓN de cotización (o devuelve una corrida previamente validada si coincide exactamente). Nunca produce cotizaciones oficiales. Úsala para cualquier mensualidad o monto a financiar; no hagas cuentas por tu cuenta.",
    input_schema: {
      type: "object",
      properties: {
        model: { type: "string" },
        version: { type: "string" },
        down_payment: { type: "number", description: "Enganche en pesos MXN." },
        term_months: { type: ["integer", "null"], description: "Plazo en meses, o null para el plazo por defecto." },
        payment_method: { type: "string", enum: ["financing", "cash"] },
      },
      required: ["model", "version", "down_payment", "term_months", "payment_method"],
      additionalProperties: false,
    },
    strict: true,
  },
];

export const TOOL_GUIDE = `# Herramientas
Lectura (puedes llamarlas durante el turno):
- get_commercial_info(model, topic): datos comerciales registrados con su estado.
- calculate_quote(model, version, down_payment, term_months, payment_method): estimación determinista o corrida validada.
Acciones (NO las ejecutas tú; las solicitas en requested_tools y el backend decide):
- schedule_appointment / schedule_test_drive (argumento requested_window con lo que pidió el cliente)
- create_followup (note)
- request_document (document_type: ine | proof_of_address | proof_of_income | bank_statement | tax_id | curp)
- send_document, request_discount (amount), request_special_condition (note), modify_price → requieren aprobación de Mario.`;
