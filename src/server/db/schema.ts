/**
 * Esquema PostgreSQL de Sofía (Drizzle ORM).
 *
 * - Compatible con Supabase/PostgreSQL y con PGlite (desarrollo/pruebas).
 * - Toda entidad comercial pertenece a un `workspace` (multitenancy ligera:
 *   hoy solo existe el workspace de Mario).
 * - Los datos comerciales llevan metadatos de conocimiento: status, fuente,
 *   tipo de fuente, vigencia, alcance de modelo/versión y notas.
 * - Los mensajes originales son inmutables (auditoría).
 * - Los documentos sensibles NO se guardan aquí: solo referencias a
 *   almacenamiento privado.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ACTION_TOOLS,
  ACTOR_TYPES,
  APPROVAL_ACTION_TYPES,
  CREDIT_APPLICATION_STATUSES,
  SALE_STATUSES,
  CONTROL_MODES,
  CRM_STAGES,
  DOCUMENT_TYPES,
  ESCALATION_TRIGGERS,
  INFO_STATUSES,
  KNOWLEDGE_CATEGORIES,
  MESSAGE_SENDERS,
  OFFER_TYPES,
  QUOTE_CALCULATION_TYPES,
  SOURCE_TYPES,
  TEMPERATURES,
} from "../../domain/enums";

// ───────────────────────────── enums ─────────────────────────────

export const crmStageEnum = pgEnum("crm_stage", CRM_STAGES);
export const temperatureEnum = pgEnum("temperature", TEMPERATURES);
export const infoStatusEnum = pgEnum("info_status", INFO_STATUSES);
export const quoteCalculationTypeEnum = pgEnum("quote_calculation_type", QUOTE_CALCULATION_TYPES);
export const sourceTypeEnum = pgEnum("source_type", SOURCE_TYPES);
export const knowledgeCategoryEnum = pgEnum("knowledge_category", KNOWLEDGE_CATEGORIES);
export const offerTypeEnum = pgEnum("offer_type", OFFER_TYPES);
export const escalationTriggerEnum = pgEnum("escalation_trigger", ESCALATION_TRIGGERS);
export const approvalActionTypeEnum = pgEnum("approval_action_type", APPROVAL_ACTION_TYPES);
export const actionToolEnum = pgEnum("action_tool", ACTION_TOOLS);
export const documentTypeEnum = pgEnum("document_type", DOCUMENT_TYPES);
export const messageSenderEnum = pgEnum("message_sender", MESSAGE_SENDERS);
export const controlModeEnum = pgEnum("control_mode", CONTROL_MODES);
export const actorTypeEnum = pgEnum("actor_type", ACTOR_TYPES);

// ───────────────────────────── helpers ─────────────────────────────

/**
 * Valor JSON guardado como texto. Evita un problema real: con PGlite, Drizzle vuelve a
 * hacer JSON.parse sobre `jsonb` de primer nivel, y cadenas como "5550000001" o "10"
 * regresaban como número. Con texto la ida y vuelta es idéntica en PGlite y PostgreSQL.
 */
const jsonText = <T>(name: string) =>
  customType<{ data: T; driverData: string }>({
    dataType: () => "text",
    toDriver: (value) => JSON.stringify(value),
    fromDriver: (value) => JSON.parse(value) as T,
  })(name);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const workspaceId = () =>
  uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const rate = (name: string) => numeric(name, { precision: 8, scale: 6, mode: "number" });

/**
 * Metadatos obligatorios de toda información comercial.
 * `model_scope` / `version_scope` vacíos o NULL = aplica a todos.
 */
const knowledgeMeta = () => ({
  status: infoStatusEnum("status").notNull(),
  sourceId: uuid("source_id").references(() => knowledgeSources.id, { onDelete: "set null" }),
  sourceType: sourceTypeEnum("source_type").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validTo: timestamp("valid_to", { withTimezone: true }),
  modelScope: text("model_scope").array(),
  versionScope: text("version_scope").array(),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ───────────────────────────── tenancy ─────────────────────────────

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    workspaceId: workspaceId(),
    name: text("name").notNull(),
    email: text("email"),
    role: text("role").notNull().default("advisor"), // owner | advisor | assistant
    createdAt: createdAt(),
  },
  (t) => [index("users_workspace_idx").on(t.workspaceId)],
);

// ───────────────────────────── clientes y conversación ─────────────────────────────

export const customers = pgTable(
  "customers",
  {
    id: id(),
    workspaceId: workspaceId(),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    phone: text("phone"),
    source: text("source").notNull().default("simulator"), // simulator | whatsapp | manual
    /** Número de cliente de la agencia ("# DE CLIENTE" del control de Mario). */
    customerNumber: text("customer_number"),
    /** Último contacto registrado por Mario (llamada, visita…); los mensajes cuentan aparte. */
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    /** none | waiting_customer | waiting_mario */
    responseStatus: text("response_status").notNull().default("none"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("customers_workspace_idx").on(t.workspaceId),
    uniqueIndex("customers_workspace_phone_uq").on(t.workspaceId, t.phone).where(sql`${t.phone} is not null`),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("simulator"), // simulator | whatsapp
    status: text("status").notNull().default("active"), // active | closed
    controlMode: controlModeEnum("control_mode").notNull().default("sofia"),
    controlChangedAt: timestamp("control_changed_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("conversations_customer_idx").on(t.customerId)],
);

/** Mensajes originales, inmutables. Nunca se editan ni se borran desde la app. */
export const messages = pgTable(
  "messages",
  {
    id: id(),
    workspaceId: workspaceId(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** Orden estable e inequívoco de la conversación. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    sender: messageSenderEnum("sender").notNull(),
    body: text("body").notNull(),
    /** Metadatos no sensibles: agent_run_id, flags de guardrails, etc. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_seq_idx").on(t.conversationId, t.seq)],
);

// ───────────────────────────── memoria del cliente ─────────────────────────────

/** Proyección actual del perfil (derivada de customer_facts activos). */
export const customerProfiles = pgTable("customer_profiles", {
  id: id(),
  workspaceId: workspaceId(),
  customerId: uuid("customer_id")
    .notNull()
    .unique()
    .references(() => customers.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  version: integer("version").notNull().default(1),
  updatedAt: updatedAt(),
});

/** Bitácora de hechos observados. Los hechos reemplazados se conservan como `superseded`. */
export const customerFacts = pgTable(
  "customer_facts",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    factKey: text("fact_key").notNull(),
    value: jsonText<unknown>("value").notNull(),
    valueText: text("value_text").notNull(),
    confidence: text("confidence").notNull().default("medium"), // high | medium | low
    /** Tipo de fuente: customer_message | mario_capture | credit_application | document | import */
    source: text("source").notNull(),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
    /** Referencia a la fuente concreta (p. ej. id de solicitud o documento) y etiqueta legible ("Solicitud BBVA"). */
    sourceRefId: uuid("source_ref_id"),
    sourceLabel: text("source_label"),
    evidence: text("evidence"),
    /** observed | confirmed | conflicting | historical | superseded | retracted */
    status: text("status").notNull().default("observed"),
    supersededBy: uuid("superseded_by"),
    confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    agentRunId: uuid("agent_run_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("customer_facts_customer_key_idx").on(t.customerId, t.factKey, t.status)],
);

/** Historial de etapa/temperatura: cuándo cambió, quién y por qué. */
export const crmStates = pgTable(
  "crm_states",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    stage: crmStageEnum("stage").notNull(),
    temperature: temperatureEnum("temperature").notNull(),
    previousStage: crmStageEnum("previous_stage"),
    previousTemperature: temperatureEnum("previous_temperature"),
    reason: text("reason").notNull(),
    changedBy: actorTypeEnum("changed_by").notNull(),
    agentRunId: uuid("agent_run_id"),
    isCurrent: boolean("is_current").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("crm_states_customer_idx").on(t.customerId, t.seq),
    uniqueIndex("crm_states_one_current_uq").on(t.customerId).where(sql`${t.isCurrent}`),
  ],
);

export const customerTags = pgTable(
  "customer_tags",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    source: actorTypeEnum("source").notNull(),
    reason: text("reason"),
    agentRunId: uuid("agent_run_id"),
    createdAt: createdAt(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("customer_tags_active_uq").on(t.customerId, t.tag).where(sql`${t.removedAt} is null`),
  ],
);

export type Commitment = {
  text: string;
  source: "mario_message" | "mario_manual";
  sourceMessageId?: string | null;
  createdAt: string;
  status: "open" | "done";
};

/** Resumen acumulado versionado + compromisos de Mario + pendientes. */
export const customerSummaries = pgTable(
  "customer_summaries",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    commitments: jsonb("commitments").$type<Commitment[]>().notNull().default([]),
    pendingItems: jsonb("pending_items").$type<string[]>().notNull().default([]),
    nextAction: jsonb("next_action").$type<{ type: string; description: string } | null>(),
    coversUntilMessageId: uuid("covers_until_message_id"),
    messageCount: integer("message_count").notNull().default(0),
    version: integer("version").notNull().default(1),
    agentRunId: uuid("agent_run_id"),
    createdAt: createdAt(),
  },
  (t) => [index("customer_summaries_customer_idx").on(t.customerId, t.version)],
);

// ───────────────────────────── conocimiento comercial ─────────────────────────────

export const knowledgeSources = pgTable("knowledge_sources", {
  id: id(),
  workspaceId: workspaceId(),
  name: text("name").notNull(),
  sourceType: sourceTypeEnum("source_type").notNull(),
  reference: text("reference"),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    id: id(),
    workspaceId: workspaceId(),
    category: knowledgeCategoryEnum("category").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    structured: jsonb("structured").$type<Record<string, unknown>>(),
    keywords: text("keywords").array(),
    ...knowledgeMeta(),
  },
  (t) => [index("knowledge_items_workspace_category_idx").on(t.workspaceId, t.category)],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: id(),
    workspaceId: workspaceId(),
    brand: text("brand").notNull().default("Honda"),
    model: text("model").notNull(),
    modelYear: integer("model_year").notNull(),
    segment: text("segment"),
    aliases: text("aliases").array(),
    active: boolean("active").notNull().default(true),
    isDemo: boolean("is_demo").notNull().default(false),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("vehicles_workspace_model_year_uq").on(t.workspaceId, t.model, t.modelYear)],
);

export const vehicleVersions = pgTable(
  "vehicle_versions",
  {
    id: id(),
    workspaceId: workspaceId(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    powertrain: text("powertrain").notNull(), // gas | hybrid
    transmission: text("transmission"),
    seats: integer("seats"),
    /** Especificaciones técnicas confirmadas (solo estas pueden afirmarse). */
    features: jsonb("features").$type<string[]>().notNull().default([]),
    specs: jsonb("specs").$type<Record<string, string | number>>().notNull().default({}),
    active: boolean("active").notNull().default(true),
    ...knowledgeMeta(),
  },
  (t) => [uniqueIndex("vehicle_versions_vehicle_name_uq").on(t.vehicleId, t.name)],
);

/** Precios de lista, bonos y promociones. Un bono pertenece a la oferta/vehículo, nunca al enganche. */
export const commercialOffers = pgTable(
  "commercial_offers",
  {
    id: id(),
    workspaceId: workspaceId(),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => vehicleVersions.id, { onDelete: "cascade" }),
    offerType: offerTypeEnum("offer_type").notNull(),
    title: text("title").notNull(),
    amount: money("amount"),
    currency: text("currency").notNull().default("MXN"),
    conditions: text("conditions"),
    ...knowledgeMeta(),
  },
  (t) => [index("commercial_offers_vehicle_idx").on(t.vehicleId, t.offerType)],
);

/**
 * Reglas explícitas que pueden modificar una oferta (p. ej. un bono).
 * Solo reglas vigentes y con status confirmed/official_quote se aplican.
 */
export const promotionRules = pgTable(
  "promotion_rules",
  {
    id: id(),
    workspaceId: workspaceId(),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => commercialOffers.id, { onDelete: "cascade" }),
    ruleType: text("rule_type").notNull(), // bonus_adjustment | eligibility | exclusion
    name: text("name").notNull(),
    condition: jsonb("condition").$type<Record<string, unknown>>().notNull().default({}),
    effect: jsonb("effect").$type<Record<string, unknown>>().notNull().default({}),
    priority: integer("priority").notNull().default(100),
    ...knowledgeMeta(),
  },
  (t) => [index("promotion_rules_offer_idx").on(t.offerId)],
);

export const financingRules = pgTable("financing_rules", {
  id: id(),
  workspaceId: workspaceId(),
  lender: text("lender").notNull(),
  productName: text("product_name").notNull(),
  annualRate: rate("annual_rate").notNull(),
  allowedTerms: integer("allowed_terms").array().notNull(),
  minDownPaymentPct: rate("min_down_payment_pct").notNull(),
  openingCommissionPct: rate("opening_commission_pct").notNull().default(0),
  requiresInsurance: boolean("requires_insurance").notNull().default(true),
  ...knowledgeMeta(),
});

export const insuranceRules = pgTable("insurance_rules", {
  id: id(),
  workspaceId: workspaceId(),
  insurer: text("insurer").notNull(),
  coverage: text("coverage").notNull(),
  annualPremium: money("annual_premium"),
  pctOfVehiclePrice: rate("pct_of_vehicle_price"),
  ...knowledgeMeta(),
});

/** Cotizaciones previamente validadas (p. ej. corridas reales hechas por Mario). */
export const quoteTemplates = pgTable("quote_templates", {
  id: id(),
  workspaceId: workspaceId(),
  name: text("name").notNull(),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  versionId: uuid("version_id")
    .notNull()
    .references(() => vehicleVersions.id, { onDelete: "cascade" }),
  financingRuleId: uuid("financing_rule_id").references(() => financingRules.id, { onDelete: "set null" }),
  vehiclePrice: money("vehicle_price").notNull(),
  downPayment: money("down_payment").notNull(),
  termMonths: integer("term_months").notNull(),
  monthlyPayment: money("monthly_payment").notNull(),
  annualRate: rate("annual_rate"),
  bonus: money("bonus").notNull().default(0),
  openingCommission: money("opening_commission"),
  insurance: money("insurance"),
  plates: money("plates"),
  otherConcepts: jsonb("other_concepts").$type<Array<{ label: string; amount: number }>>().notNull().default([]),
  conditions: text("conditions"),
  ...knowledgeMeta(),
});

export type OtherConcept = { label: string; amount: number };

export const quotes = pgTable(
  "quotes",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    versionId: uuid("version_id").references(() => vehicleVersions.id, { onDelete: "set null" }),
    calculationType: quoteCalculationTypeEnum("calculation_type").notNull(),
    status: text("status").notNull().default("draft"), // draft | presented | superseded | expired
    vehiclePrice: money("vehicle_price").notNull(),
    downPayment: money("down_payment").notNull(),
    termMonths: integer("term_months"),
    monthlyPayment: money("monthly_payment"),
    annualRate: rate("annual_rate"),
    bonus: money("bonus").notNull().default(0),
    bonusOfferId: uuid("bonus_offer_id").references(() => commercialOffers.id, { onDelete: "set null" }),
    openingCommission: money("opening_commission"),
    insurance: money("insurance"),
    plates: money("plates"),
    otherConcepts: jsonb("other_concepts").$type<OtherConcept[]>().notNull().default([]),
    conditions: text("conditions"),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    sourceId: uuid("source_id").references(() => knowledgeSources.id, { onDelete: "set null" }),
    templateId: uuid("template_id").references(() => quoteTemplates.id, { onDelete: "set null" }),
    /** Sprint 3: corrida del motor V2 (programa validado contra corridas reales) de la que proviene. */
    quoteRunId: uuid("quote_run_id").references((): AnyPgColumn => quoteRuns.id, { onDelete: "set null" }),
    financingRuleId: uuid("financing_rule_id").references(() => financingRules.id, { onDelete: "set null" }),
    calculationTrace: jsonb("calculation_trace").$type<string[]>().notNull().default([]),
    createdBy: actorTypeEnum("created_by").notNull(),
    agentRunId: uuid("agent_run_id"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("quotes_customer_idx").on(t.customerId, t.createdAt),
    // Una cotización oficial solo puede registrarla Mario y siempre con fuente.
    check(
      "quotes_official_requires_mario_and_source",
      sql`${t.calculationType} <> 'official' OR (${t.createdBy} = 'mario' AND ${t.sourceId} IS NOT NULL)`,
    ),
    // Una plantilla validada siempre referencia la plantilla de origen.
    check(
      "quotes_template_requires_template_id",
      sql`${t.calculationType} <> 'validated_template' OR ${t.templateId} IS NOT NULL OR ${t.quoteRunId} IS NOT NULL`,
    ),
  ],
);

// ───────────────────────────── operación ─────────────────────────────

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // visit | test_drive | delivery | call
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    requestedWindow: text("requested_window"),
    status: text("status").notNull().default("scheduled"), // scheduled | confirmed | completed | cancelled | no_show
    location: text("location"),
    notes: text("notes"),
    createdBy: actorTypeEnum("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("appointments_customer_idx").on(t.customerId)],
);

export const followups = pgTable(
  "followups",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"), // pending | done | cancelled
    /** Acción concreta: llamar, enviar documento, confirmar cita… */
    action: text("action"),
    /** Mario se comprometió con el cliente (promesa pendiente). */
    promisedByMario: boolean("promised_by_mario").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: actorTypeEnum("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("followups_customer_idx").on(t.customerId, t.status)],
);

/**
 * Recordatorios libres de Mario ("recuérdame…"), opcionalmente ligados a un cliente.
 * Seguimientos y citas también generan avisos; esta tabla es para lo que no es ninguno de los dos.
 * "alarm" = aviso de máxima prioridad (canal de alarmas en la tablet).
 */
export const reminders = pgTable(
  "reminders",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    text: text("text").notNull(),
    alarm: boolean("alarm").notNull().default(false),
    status: text("status").notNull().default("pending"), // pending | done | cancelled
    createdBy: actorTypeEnum("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("reminders_ws_at_idx").on(t.workspaceId, t.status, t.remindAt)],
);

/**
 * Documentos del cliente. El contenido vive en almacenamiento privado;
 * aquí solo hay referencia, hash y estado. Nunca se inyecta en prompts.
 */
export const documents = pgTable(
  "documents",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    docType: documentTypeEnum("doc_type").notNull(),
    status: text("status").notNull().default("requested"), // missing | requested | received | needs_review | accepted | rejected
    creditApplicationId: uuid("credit_application_id"),
    reviewNotes: text("review_notes"),
    /** Sprint tablet: bandeja de documentos. Nombre original (privado; nunca en logs). */
    fileName: text("file_name"),
    /** uploaded | processing | observed | needs_review | confirmed | rejected */
    extractionStatus: text("extraction_status"),
    extractionProvider: text("extraction_provider"),
    extractionNote: text("extraction_note"),
    isSensitive: boolean("is_sensitive").notNull().default(true),
    storageProvider: text("storage_provider"), // local_private | supabase_storage
    storageBucket: text("storage_bucket"),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    sha256: text("sha256"),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("documents_customer_idx").on(t.customerId)],
);

export type MarioAlertPayload = {
  customer: string;
  vehicle: string | null;
  version: string | null;
  downPayment: number | null;
  monthlyTarget: number | null;
  purchaseTiming: string | null;
  crmStage: string;
  temperature: string;
  quoteStatus: string;
  creditStatus: string;
  mainObjection: string | null;
  reasonForEscalation: string;
  recommendedNextStep: string;
  shortSummary: string;
};

export const marioAlerts = pgTable(
  "mario_alerts",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    agentRunId: uuid("agent_run_id"),
    trigger: escalationTriggerEnum("trigger").notNull(),
    title: text("title").notNull().default("🔥 MARIO, ENTRA TÚ"),
    payload: jsonb("payload").$type<MarioAlertPayload>().notNull(),
    status: text("status").notNull().default("open"), // open | acknowledged | resolved | dismissed
    createdAt: createdAt(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("mario_alerts_status_idx").on(t.workspaceId, t.status)],
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    agentRunId: uuid("agent_run_id"),
    actionType: approvalActionTypeEnum("action_type").notNull(),
    requestedTool: actionToolEnum("requested_tool"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"), // pending | approved | rejected | expired | cancelled
    requestedBy: actorTypeEnum("requested_by").notNull(),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNotes: text("decision_notes"),
    createdAt: createdAt(),
  },
  (t) => [index("approval_requests_status_idx").on(t.workspaceId, t.status)],
);

/** Registro de cada turno del cerebro (entrada resumida, salida validada, guardrails). */
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    inboundMessageId: uuid("inbound_message_id").references(() => messages.id, { onDelete: "set null" }),
    replyMessageId: uuid("reply_message_id").references(() => messages.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    model: text("model"),
    status: text("status").notNull(), // ok | fallback | error
    contextStats: jsonb("context_stats").$type<Record<string, number>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, unknown>>(),
    guardReport: jsonb("guard_report").$type<Record<string, unknown>>().notNull().default({}),
    appliedEffects: jsonb("applied_effects").$type<Record<string, unknown>>().notNull().default({}),
    knowledgeUsed: jsonb("knowledge_used").$type<Array<Record<string, unknown>>>().notNull().default([]),
    toolCalls: jsonb("tool_calls").$type<Array<Record<string, unknown>>>().notNull().default([]),
    usage: jsonb("usage").$type<Record<string, number>>(),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("agent_runs_conversation_idx").on(t.conversationId, t.createdAt)],
);

/** Auditoría. `data` nunca debe contener PII sensible ni cuerpos de mensaje. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    workspaceId: workspaceId(),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id"),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_events_customer_idx").on(t.customerId, t.createdAt)],
);

// ───────────────────────────── Sprint 2: crédito ─────────────────────────────

export const creditApplicationStatusEnum = pgEnum("credit_application_status", CREDIT_APPLICATION_STATUSES);
export const saleStatusEnum = pgEnum("sale_status", SALE_STATUSES);

/** Financieras disponibles (BBVA, Banorte, …). Agregar una nueva = una fila + un adaptador. */
export const creditInstitutions = pgTable(
  "credit_institutions",
  {
    id: id(),
    workspaceId: workspaceId(),
    code: text("code").notNull(), // BBVA | BANORTE | …
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("credit_institutions_ws_code_uq").on(t.workspaceId, t.code)],
);

/**
 * Plantillas de solicitud (PDF AcroForm original). La plantilla nunca se modifica:
 * cada solicitud genera una copia nueva. `field_mapping` traduce los slots del
 * adaptador a los nombres reales de campo del PDF.
 */
export const applicationTemplates = pgTable("application_templates", {
  id: id(),
  workspaceId: workspaceId(),
  institutionId: uuid("institution_id")
    .notNull()
    .references(() => creditInstitutions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  version: text("version").notNull(),
  /** Referencia en almacenamiento privado ({provider,bucket,key}) + hash del original. */
  sourceDocument: jsonb("source_document").$type<{ provider: string; bucket: string; key: string; sha256: string; sizeBytes: number; fileName: string }>().notNull(),
  active: boolean("active").notNull().default(true),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  /** slot del adaptador → nombre de campo AcroForm. */
  fieldMapping: jsonb("field_mapping").$type<Record<string, string>>().notNull().default({}),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

/** Un cliente puede tener muchas solicitudes (BBVA rechazada, Banorte aprobada…). */
export const creditApplications = pgTable(
  "credit_applications",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => creditInstitutions.id),
    templateId: uuid("template_id").references(() => applicationTemplates.id, { onDelete: "set null" }),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    status: creditApplicationStatusEnum("status").notNull().default("draft"),
    statusReason: text("status_reason"),
    /** Datos propios de la solicitud que no son del perfil universal (p. ej. monto solicitado). */
    answers: jsonb("answers").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: actorTypeEnum("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("credit_applications_customer_idx").on(t.customerId)],
);

export const creditApplicationEvents = pgTable(
  "credit_application_events",
  {
    id: id(),
    workspaceId: workspaceId(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => creditApplications.id, { onDelete: "cascade" }),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    fromStatus: creditApplicationStatusEnum("from_status"),
    toStatus: creditApplicationStatusEnum("to_status").notNull(),
    reason: text("reason"),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: uuid("actor_id"),
    createdAt: createdAt(),
  },
  (t) => [index("credit_application_events_app_idx").on(t.applicationId, t.seq)],
);

/** PDFs generados (borradores). Se registran nombres de campo y fuentes, nunca valores. */
export const generatedDocuments = pgTable(
  "generated_documents",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => creditApplications.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => applicationTemplates.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("credit_application_draft"),
    storage: jsonb("storage").$type<{ provider: string; bucket: string; key: string; sha256: string; sizeBytes: number }>().notNull(),
    fieldsFilled: jsonb("fields_filled").$type<Array<{ slot: string; pdfField: string; profileKey: string }>>().notNull().default([]),
    fieldsSkipped: jsonb("fields_skipped").$type<Array<{ slot: string; reason: string }>>().notNull().default([]),
    sourcesUsed: jsonb("sources_used").$type<Array<{ factId: string; profileKey: string; sourceLabel: string | null; status: string }>>().notNull().default([]),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    generatedBy: uuid("generated_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("generated_documents_app_idx").on(t.applicationId)],
);

/**
 * Reglas documentales por financiera y tipo de cliente. NO se generalizan
 * automáticamente de una financiera a otra.
 */
export const documentRequirements = pgTable("document_requirements", {
  id: id(),
  workspaceId: workspaceId(),
  institutionId: uuid("institution_id")
    .notNull()
    .references(() => creditInstitutions.id, { onDelete: "cascade" }),
  customerType: text("customer_type").notNull(), // employed | self_employed | business_owner | all
  documentType: documentTypeEnum("document_type").notNull(),
  requiredIf: jsonb("required_if").$type<Record<string, unknown> | null>(),
  description: text("description"),
  source: text("source").notNull(),
  version: text("version").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validTo: timestamp("valid_to", { withTimezone: true }),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

// ───────────────────────────── Sprint 2: control de ventas ─────────────────────────────

/**
 * Control de ventas de Mario. Conserva TODAS las columnas de su archivo
 * operativo. Es una entidad distinta de la cotización, relacionada con
 * cliente, cotización, solicitud de crédito y vehículo.
 */
export const saleRecords = pgTable(
  "sale_records",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    creditApplicationId: uuid("credit_application_id").references(() => creditApplications.id, { onDelete: "set null" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    versionId: uuid("version_id").references(() => vehicleVersions.id, { onDelete: "set null" }),
    // Columnas del control de ventas de Mario
    customerName: text("customer_name").notNull(),
    customerNumber: text("customer_number"),
    orderNumber: text("order_number"),
    invoiceNumber: text("invoice_number"),
    unitDescription: text("unit_description"),
    bonus: money("bonus"),
    downPayment: money("down_payment"),
    invoiceValue: money("invoice_value"),
    invoiceDate: timestamp("invoice_date", { withTimezone: true }),
    deliveryDate: timestamp("delivery_date", { withTimezone: true }),
    extras: text("extras"),
    extrasAmount: money("extras_amount"),
    warrantyAmount: money("warranty_amount"),
    warrantyYears: integer("warranty_years"),
    openingCommission: money("opening_commission"),
    insuranceAmount: money("insurance_amount"),
    bonusUsage: text("bonus_usage"),
    agreements: text("agreements"),
    // Técnicos
    vin: text("vin"),
    status: saleStatusEnum("status").notNull().default("prospect"),
    source: text("source").notNull().default("manual"), // manual | quote | import
    notes: text("notes"),
    createdBy: actorTypeEnum("created_by").notNull(),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sale_records_ws_status_idx").on(t.workspaceId, t.status), index("sale_records_customer_idx").on(t.customerId)],
);

/** Historial de cambios de la venta (valores comerciales críticos nunca se sobrescriben en silencio). */
export const saleRecordChanges = pgTable(
  "sale_record_changes",
  {
    id: id(),
    workspaceId: workspaceId(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => saleRecords.id, { onDelete: "cascade" }),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    field: text("field").notNull(),
    oldValue: jsonText<unknown>("old_value"),
    newValue: jsonText<unknown>("new_value"),
    reason: text("reason"),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: uuid("actor_id"),
    createdAt: createdAt(),
  },
  (t) => [index("sale_record_changes_sale_idx").on(t.saleId, t.seq)],
);

// ───────────────────────────── Comisiones: SOLO estructura ─────────────────────────────
// Mario explicará sus reglas más adelante. No hay fórmulas ni cálculos todavía:
// estas tablas existen para que el control de ventas no tenga que rediseñarse.

export const commissionRules = pgTable("commission_rules", {
  id: id(),
  workspaceId: workspaceId(),
  name: text("name").notNull(),
  /** Definición declarativa confirmada por Mario (formato por definir). */
  definition: jsonb("definition").$type<Record<string, unknown>>().notNull().default({}),
  confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validTo: timestamp("valid_to", { withTimezone: true }),
  active: boolean("active").notNull().default(false),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const commissionPeriods = pgTable("commission_periods", {
  id: id(),
  workspaceId: workspaceId(),
  startsOn: timestamp("starts_on", { withTimezone: true }).notNull(),
  endsOn: timestamp("ends_on", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("open"), // open | closed
  createdAt: createdAt(),
});

export const commissionCalculations = pgTable("commission_calculations", {
  id: id(),
  workspaceId: workspaceId(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => saleRecords.id, { onDelete: "cascade" }),
  periodId: uuid("period_id").references(() => commissionPeriods.id, { onDelete: "set null" }),
  ruleId: uuid("rule_id").references(() => commissionRules.id, { onDelete: "set null" }),
  amount: money("amount"),
  /** Entradas usadas y traza del motor determinista (futuro). */
  inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
  trace: jsonb("trace").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("pending"), // pending | confirmed | paid
  createdAt: createdAt(),
});

export const commissionAdjustments = pgTable("commission_adjustments", {
  id: id(),
  workspaceId: workspaceId(),
  calculationId: uuid("calculation_id")
    .notNull()
    .references(() => commissionCalculations.id, { onDelete: "cascade" }),
  amount: money("amount").notNull(),
  reason: text("reason").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const commissionPayments = pgTable("commission_payments", {
  id: id(),
  workspaceId: workspaceId(),
  periodId: uuid("period_id").references(() => commissionPeriods.id, { onDelete: "set null" }),
  amount: money("amount").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  reference: text("reference"),
  createdAt: createdAt(),
});

// ───────────────────────────── Sprint 3: cotizador V2 ─────────────────────────────

/** Lista de precios con fuente y vigencia (p. ej. "Lista Honda septiembre"). */
export const priceBooks = pgTable("price_books", {
  id: id(),
  workspaceId: workspaceId(),
  name: text("name").notNull(),
  ...knowledgeMeta(),
});

export const vehiclePrices = pgTable(
  "vehicle_prices",
  {
    id: id(),
    workspaceId: workspaceId(),
    priceBookId: uuid("price_book_id")
      .notNull()
      .references(() => priceBooks.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => vehicleVersions.id, { onDelete: "cascade" }),
    listPrice: money("list_price").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("vehicle_prices_book_version_uq").on(t.priceBookId, t.versionId)],
);

/**
 * Programa de financiamiento. Cada parámetro NULL significa "la fuente no lo define":
 * el motor no lo supone y la corrida queda incompleta.
 */
export const financePrograms = pgTable("finance_programs", {
  id: id(),
  workspaceId: workspaceId(),
  lender: text("lender").notNull(),
  name: text("name").notNull(),
  calibrationStatus: text("calibration_status").notNull().default("unverified"), // unverified | calibrating | validated | expired
  calibrationReport: jsonb("calibration_report").$type<Record<string, unknown>>(),
  calibratedAt: timestamp("calibrated_at", { withTimezone: true }),
  bonusApplication: text("bonus_application"), // price_reduction | down_payment
  ivaOnInterest: boolean("iva_on_interest"),
  ivaRate: rate("iva_rate"),
  openingCommissionRate: rate("opening_commission_rate"),
  openingCommissionFinanced: boolean("opening_commission_financed"),
  openingCommissionIva: boolean("opening_commission_iva"),
  insuranceMode: text("insurance_mode"), // cash | financed | not_included
  minDownPaymentRate: rate("min_down_payment_rate"),
  ...knowledgeMeta(),
});

export const financeTerms = pgTable(
  "finance_terms",
  {
    id: id(),
    programId: uuid("program_id")
      .notNull()
      .references(() => financePrograms.id, { onDelete: "cascade" }),
    termMonths: integer("term_months").notNull(),
    annualRate: rate("annual_rate"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("finance_terms_program_term_uq").on(t.programId, t.termMonths)],
);

/** Conceptos con monto respaldado por fuente: seguro, garantía, accesorios, cargos. */
export const quoteComponentsConfig = pgTable("quote_components", {
  id: id(),
  workspaceId: workspaceId(),
  kind: text("kind").notNull(), // insurance | warranty | accessory | fee
  label: text("label").notNull(),
  amount: money("amount").notNull(),
  termMonths: integer("term_months"),
  ...knowledgeMeta(),
});

/** Corridas reales de Mario usadas para calibrar programas. */
export const validatedQuoteExamples = pgTable("validated_quote_examples", {
  id: id(),
  workspaceId: workspaceId(),
  programId: uuid("program_id").references(() => financePrograms.id, { onDelete: "set null" }),
  versionId: uuid("version_id").references(() => vehicleVersions.id, { onDelete: "set null" }),
  label: text("label").notNull(),
  downPayment: money("down_payment").notNull(),
  termMonths: integer("term_months").notNull(),
  vehiclePrice: money("vehicle_price").notNull(),
  bonus: money("bonus").notNull().default(0),
  insurance: money("insurance"),
  expected: jsonb("expected").$type<Record<string, number>>().notNull(),
  quotedAt: timestamp("quoted_at", { withTimezone: true }),
  sourceLabel: text("source_label").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

/** Cada cotización calculada (auditable): entradas, componentes con fuente y faltantes. */
export const quoteRuns = pgTable(
  "quote_runs",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    versionId: uuid("version_id").references(() => vehicleVersions.id, { onDelete: "set null" }),
    programId: uuid("program_id").references(() => financePrograms.id, { onDelete: "set null" }),
    vehicleLabel: text("vehicle_label").notNull(),
    downPayment: money("down_payment").notNull(),
    termMonths: integer("term_months").notNull(),
    exactness: text("exactness").notNull(), // exact | unvalidated | incomplete | validated_example
    monthlyPayment: money("monthly_payment"),
    components: jsonb("components").$type<Array<Record<string, unknown>>>().notNull(),
    missing: jsonb("missing").$type<string[]>().notNull().default([]),
    saved: boolean("saved").notNull().default(false),
    isDemo: boolean("is_demo").notNull().default(false),
    createdBy: actorTypeEnum("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("quote_runs_customer_idx").on(t.customerId, t.createdAt)],
);

// ───────────────────────────── Sprint 3: operación ─────────────────────────────

/** Requisitos de placas CON FUENTE (los captura Mario; no se inventan requisitos oficiales). */
export const plateRequirements = pgTable("plate_requirements", {
  id: id(),
  workspaceId: workspaceId(),
  label: text("label").notNull(),
  sourceLabel: text("source_label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const plateCases = pgTable(
  "plate_cases",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    saleId: uuid("sale_id").references(() => saleRecords.id, { onDelete: "set null" }),
    vehicleLabel: text("vehicle_label"),
    vin: text("vin"),
    status: text("status").notNull().default("not_started"), // not_started | collecting_documents | ready | submitted | waiting | completed | problem
    requirements: jsonb("requirements").$type<Array<{ id: string; label: string; source: string; received: boolean; receivedAt?: string | null }>>().notNull().default([]),
    nextStep: text("next_step"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    notes: text("notes"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("plate_cases_customer_idx").on(t.customerId)],
);

/** Correos: borradores y envíos. Nunca se envía sin confirmación explícita. */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: id(),
    workspaceId: workspaceId(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    plateCaseId: uuid("plate_case_id").references(() => plateCases.id, { onDelete: "set null" }),
    saleId: uuid("sale_id").references(() => saleRecords.id, { onDelete: "set null" }),
    purpose: text("purpose").notNull(), // plates | documents | quote | general
    toAddress: text("to_address"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    attachments: jsonb("attachments").$type<Array<{ documentId: string; label: string }>>().notNull().default([]),
    status: text("status").notNull().default("draft"), // draft | sent | cancelled | failed | opened_in_mail
    provider: text("provider"),
    providerMessageId: text("provider_message_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    createdBy: actorTypeEnum("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("email_messages_customer_idx").on(t.customerId)],
);

/** Devoluciones: estructura mínima. El proceso está pendiente de definición por Mario. */
export const returnCases = pgTable("return_cases", {
  id: id(),
  workspaceId: workspaceId(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  saleId: uuid("sale_id").references(() => saleRecords.id, { onDelete: "set null" }),
  type: text("type").notNull().default("por_definir"),
  reason: text("reason"),
  status: text("status").notNull().default("open"), // open | resolved | cancelled
  amount: money("amount"),
  notes: text("notes"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// ───────────────────────────── Piloto tablet ─────────────────────────────

/** Cada llamada a un proveedor de IA (LLM, visión). Las funciones normales no llaman IA. */
export const aiUsageEvents = pgTable("ai_usage_events", {
  id: id(),
  workspaceId: workspaceId(),
  provider: text("provider").notNull(),
  purpose: text("purpose").notNull(), // conversation | extraction | summary | drafting | command
  ok: boolean("ok").notNull(),
  durationMs: integer("duration_ms"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: createdAt(),
});
