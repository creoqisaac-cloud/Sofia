/**
 * Vocabulario controlado de Sofía.
 *
 * Todo lo que el LLM puede "proponer" (etapas, temperatura, estados de
 * información, disparadores de escalamiento, acciones) sale de estas listas.
 * El backend rechaza cualquier valor fuera de ellas.
 */

export const CRM_STAGES = [
  "new",
  "profiling",
  "quotation",
  "financing",
  "documentation",
  "application",
  "credit",
  "appointment",
  "test_drive",
  "negotiation",
  "closing",
  "sold",
  "follow_up",
  "not_interested",
] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

export const CRM_STAGE_LABELS: Record<CrmStage, string> = {
  new: "Nuevo",
  profiling: "Perfilamiento",
  quotation: "Cotización",
  financing: "Financiamiento",
  documentation: "Documentación",
  application: "Solicitud",
  credit: "Crédito",
  appointment: "Cita",
  test_drive: "Prueba de manejo",
  negotiation: "Negociación",
  closing: "Cierre",
  sold: "Vendido",
  follow_up: "Seguimiento",
  not_interested: "No interesado",
};

export const TEMPERATURES = ["cold", "interested", "hot", "very_hot"] as const;
export type Temperature = (typeof TEMPERATURES)[number];

export const TEMPERATURE_LABELS: Record<Temperature, string> = {
  cold: "Frío",
  interested: "Interesado",
  hot: "Caliente",
  very_hot: "Muy caliente",
};

/**
 * Estado de cualquier dato comercial. Sofía siempre debe saber (y decir)
 * con qué tipo de información está hablando.
 */
export const INFO_STATUSES = [
  "confirmed",
  "official_quote",
  "validated_quote",
  "estimate",
  "historical",
  "unknown",
] as const;
export type InfoStatus = (typeof INFO_STATUSES)[number];

export const INFO_STATUS_LABELS: Record<InfoStatus, string> = {
  confirmed: "Confirmado",
  official_quote: "Cotización oficial",
  validated_quote: "Cotización validada",
  estimate: "Estimación",
  historical: "Histórico (no vigente)",
  unknown: "Desconocido",
};

export const QUOTE_CALCULATION_TYPES = ["official", "validated_template", "estimate"] as const;
export type QuoteCalculationType = (typeof QUOTE_CALCULATION_TYPES)[number];

export const QUOTE_CALCULATION_LABELS: Record<QuoteCalculationType, string> = {
  official: "Cotización oficial",
  validated_template: "Cotización previamente validada",
  estimate: "Estimación",
};

export const SOURCE_TYPES = [
  "official_price_list",
  "official_promotion",
  "dealer_bulletin",
  "lender_rate_sheet",
  "insurer_rate_sheet",
  "official_quote_document",
  "mario_manual",
  "demo_fixture",
  "other",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const KNOWLEDGE_CATEGORIES = [
  "price",
  "bonus",
  "promotion",
  "financing",
  "insurance",
  "warranty",
  "feature",
  "availability",
  "policy",
  "faq",
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const OFFER_TYPES = ["list_price", "bonus", "promotion", "gift"] as const;
export type OfferType = (typeof OFFER_TYPES)[number];

export const ESCALATION_TRIGGERS = [
  "customer_requests_mario",
  "credit_approved",
  "ready_to_purchase",
  "special_negotiation",
  "discount_outside_rules",
  "special_condition",
  "human_judgment",
  "approaching_closing",
] as const;
export type EscalationTrigger = (typeof ESCALATION_TRIGGERS)[number];

export const ESCALATION_TRIGGER_LABELS: Record<EscalationTrigger, string> = {
  customer_requests_mario: "El cliente pide hablar con Mario",
  credit_approved: "Crédito aprobado",
  ready_to_purchase: "Cliente listo para comprar",
  special_negotiation: "Pide negociación especial",
  discount_outside_rules: "Pide descuento fuera de reglas confirmadas",
  special_condition: "Pide condición especial",
  human_judgment: "Se necesita criterio comercial humano",
  approaching_closing: "Cliente cerca del cierre",
};

export const APPROVAL_ACTION_TYPES = [
  "special_negotiation",
  "price_modification",
  "discount_request",
  "financial_sensitive_action",
  "send_sensitive_document",
  "outside_commercial_rules",
] as const;
export type ApprovalActionType = (typeof APPROVAL_ACTION_TYPES)[number];

export const APPROVAL_ACTION_LABELS: Record<ApprovalActionType, string> = {
  special_negotiation: "Negociación especial",
  price_modification: "Modificación de precio",
  discount_request: "Solicitud de descuento",
  financial_sensitive_action: "Acción financiera sensible",
  send_sensitive_document: "Envío de documentación sensible",
  outside_commercial_rules: "Fuera de reglas comerciales confirmadas",
};

/** Acciones que Sofía puede *solicitar*; el backend decide si se ejecutan. */
export const ACTION_TOOLS = [
  "schedule_appointment",
  "schedule_test_drive",
  "create_followup",
  "request_document",
  "send_document",
  "request_discount",
  "request_special_condition",
  "modify_price",
] as const;
export type ActionTool = (typeof ACTION_TOOLS)[number];

export const NEXT_ACTION_TYPES = [
  "ask_question",
  "send_info",
  "send_quote",
  "schedule_appointment",
  "schedule_test_drive",
  "request_document",
  "followup",
  "escalate_to_mario",
  "wait_customer",
  "none",
] as const;
export type NextActionType = (typeof NEXT_ACTION_TYPES)[number];

export const NEXT_ACTION_LABELS: Record<NextActionType, string> = {
  ask_question: "Preguntar dato faltante",
  send_info: "Enviar información",
  send_quote: "Enviar cotización",
  schedule_appointment: "Agendar cita",
  schedule_test_drive: "Agendar prueba de manejo",
  request_document: "Pedir documento",
  followup: "Dar seguimiento",
  escalate_to_mario: "Escalar a Mario",
  wait_customer: "Esperar respuesta del cliente",
  none: "Sin acción",
};

export const DOCUMENT_TYPES = [
  "ine",
  "proof_of_address",
  "proof_of_income",
  "bank_statement",
  "tax_id",
  "curp",
  "quote_pdf",
  "other",
  "employment_letter",
  "credit_application",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  ine: "INE",
  proof_of_address: "Comprobante de domicilio",
  proof_of_income: "Nómina / comprobante de ingresos",
  bank_statement: "Estados de cuenta",
  tax_id: "Constancia de situación fiscal",
  curp: "CURP",
  quote_pdf: "Cotización PDF",
  other: "Otro",
  employment_letter: "Carta laboral",
  credit_application: "Solicitud de crédito",
};

export const MESSAGE_SENDERS = ["customer", "sofia", "mario", "system"] as const;
export type MessageSender = (typeof MESSAGE_SENDERS)[number];

export const CONTROL_MODES = ["sofia", "mario"] as const;
export type ControlMode = (typeof CONTROL_MODES)[number];

export const ACTOR_TYPES = ["sofia", "mario", "system", "customer"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

// ───────────────────────── Sprint 2 ─────────────────────────

/** Estado de un hecho del perfil (provenance). `retracted` se conserva de Sprint 1. */
export const FACT_STATUSES = ["observed", "confirmed", "conflicting", "historical", "superseded", "retracted"] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];
/** Estados que cuentan como "valor vigente" del perfil (los conflictivos NO). */
export const CURRENT_FACT_STATUSES: FactStatus[] = ["observed", "confirmed"];

export const FACT_SOURCE_TYPES = ["customer_message", "mario_capture", "credit_application", "document", "import"] as const;
export type FactSourceType = (typeof FACT_SOURCE_TYPES)[number];
export const FACT_SOURCE_LABELS: Record<FactSourceType, string> = {
  customer_message: "Conversación",
  mario_capture: "Captura de Mario",
  credit_application: "Solicitud de crédito",
  document: "Documento",
  import: "Importación",
};

export const DOCUMENT_STATUSES = ["missing", "requested", "received", "needs_review", "accepted", "rejected"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  missing: "Falta",
  requested: "Solicitado",
  received: "Recibido",
  needs_review: "Por revisar",
  accepted: "Aceptado",
  rejected: "Rechazado",
};

export const CREDIT_APPLICATION_STATUSES = [
  "draft",
  "missing_information",
  "conflict",
  "ready_for_review",
  "ready_for_signature",
  "submitted",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type CreditApplicationStatus = (typeof CREDIT_APPLICATION_STATUSES)[number];
export const CREDIT_APPLICATION_STATUS_LABELS: Record<CreditApplicationStatus, string> = {
  draft: "Borrador",
  missing_information: "Faltan datos",
  conflict: "Con conflicto",
  ready_for_review: "Lista para revisión",
  ready_for_signature: "Lista para firma",
  submitted: "Enviada",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

/** Clasificación de cada campo de una solicitud. */
export const FIELD_CLASSES = ["AUTO_FILL", "ASK_IF_MISSING", "CONDITIONAL", "HUMAN_CONFIRMATION", "SIGNATURE"] as const;
export type FieldClass = (typeof FIELD_CLASSES)[number];

export const SALE_STATUSES = [
  "prospect",
  "negotiation",
  "credit_process",
  "approved",
  "order_created",
  "invoiced",
  "delivery_pending",
  "delivered",
  "cancelled",
] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];
export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  prospect: "Prospecto",
  negotiation: "Negociación",
  credit_process: "En crédito",
  approved: "Aprobada",
  order_created: "Pedido creado",
  invoiced: "Facturada",
  delivery_pending: "Por entregar",
  delivered: "Entregada",
  cancelled: "Cancelada",
};
