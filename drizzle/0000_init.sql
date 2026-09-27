CREATE TYPE "public"."action_tool" AS ENUM('schedule_appointment', 'schedule_test_drive', 'create_followup', 'request_document', 'send_document', 'request_discount', 'request_special_condition', 'modify_price');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('sofia', 'mario', 'system', 'customer');--> statement-breakpoint
CREATE TYPE "public"."approval_action_type" AS ENUM('special_negotiation', 'price_modification', 'discount_request', 'financial_sensitive_action', 'send_sensitive_document', 'outside_commercial_rules');--> statement-breakpoint
CREATE TYPE "public"."control_mode" AS ENUM('sofia', 'mario');--> statement-breakpoint
CREATE TYPE "public"."crm_stage" AS ENUM('new', 'profiling', 'quotation', 'financing', 'documentation', 'application', 'credit', 'appointment', 'test_drive', 'negotiation', 'closing', 'sold', 'follow_up', 'not_interested');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('ine', 'proof_of_address', 'proof_of_income', 'bank_statement', 'tax_id', 'curp', 'quote_pdf', 'other');--> statement-breakpoint
CREATE TYPE "public"."escalation_trigger" AS ENUM('customer_requests_mario', 'credit_approved', 'ready_to_purchase', 'special_negotiation', 'discount_outside_rules', 'special_condition', 'human_judgment', 'approaching_closing');--> statement-breakpoint
CREATE TYPE "public"."info_status" AS ENUM('confirmed', 'official_quote', 'validated_quote', 'estimate', 'historical', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."knowledge_category" AS ENUM('price', 'bonus', 'promotion', 'financing', 'insurance', 'warranty', 'feature', 'availability', 'policy', 'faq');--> statement-breakpoint
CREATE TYPE "public"."message_sender" AS ENUM('customer', 'sofia', 'mario', 'system');--> statement-breakpoint
CREATE TYPE "public"."offer_type" AS ENUM('list_price', 'bonus', 'promotion', 'gift');--> statement-breakpoint
CREATE TYPE "public"."quote_calculation_type" AS ENUM('official', 'validated_template', 'estimate');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('official_price_list', 'official_promotion', 'dealer_bulletin', 'lender_rate_sheet', 'insurer_rate_sheet', 'official_quote_document', 'mario_manual', 'demo_fixture', 'other');--> statement-breakpoint
CREATE TYPE "public"."temperature" AS ENUM('cold', 'interested', 'hot', 'very_hot');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"inbound_message_id" uuid,
	"reply_message_id" uuid,
	"provider" text NOT NULL,
	"model" text,
	"status" text NOT NULL,
	"context_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"guard_report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"applied_effects" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"knowledge_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"usage" jsonb,
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"conversation_id" uuid,
	"kind" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"requested_window" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"notes" text,
	"created_by" "actor_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"conversation_id" uuid,
	"agent_run_id" uuid,
	"action_type" "approval_action_type" NOT NULL,
	"requested_tool" "action_tool",
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" "actor_type" NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"event_type" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"customer_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"version_id" uuid,
	"offer_type" "offer_type" NOT NULL,
	"title" text NOT NULL,
	"amount" numeric(14, 2),
	"currency" text DEFAULT 'MXN' NOT NULL,
	"conditions" text,
	"status" "info_status" NOT NULL,
	"source_id" uuid,
	"source_type" "source_type" NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"model_scope" text[],
	"version_scope" text[],
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"channel" text DEFAULT 'simulator' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"control_mode" "control_mode" DEFAULT 'sofia' NOT NULL,
	"control_changed_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"seq" bigserial NOT NULL,
	"stage" "crm_stage" NOT NULL,
	"temperature" "temperature" NOT NULL,
	"previous_stage" "crm_stage",
	"previous_temperature" "temperature",
	"reason" text NOT NULL,
	"changed_by" "actor_type" NOT NULL,
	"agent_run_id" uuid,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"fact_key" text NOT NULL,
	"value" jsonb NOT NULL,
	"value_text" text NOT NULL,
	"confidence" text DEFAULT 'medium' NOT NULL,
	"source" text NOT NULL,
	"source_message_id" uuid,
	"evidence" text,
	"status" text DEFAULT 'active' NOT NULL,
	"superseded_by" uuid,
	"agent_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_profiles_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "customer_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"commitments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pending_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_action" jsonb,
	"covers_until_message_id" uuid,
	"message_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"agent_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"source" "actor_type" NOT NULL,
	"reason" text,
	"agent_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"display_name" text NOT NULL,
	"phone" text,
	"source" text DEFAULT 'simulator' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"doc_type" "document_type" NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"is_sensitive" boolean DEFAULT true NOT NULL,
	"storage_provider" text,
	"storage_bucket" text,
	"storage_key" text,
	"mime_type" text,
	"size_bytes" integer,
	"sha256" text,
	"requested_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"retention_until" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lender" text NOT NULL,
	"product_name" text NOT NULL,
	"annual_rate" numeric(8, 6) NOT NULL,
	"allowed_terms" integer[] NOT NULL,
	"min_down_payment_pct" numeric(8, 6) NOT NULL,
	"opening_commission_pct" numeric(8, 6) DEFAULT 0 NOT NULL,
	"requires_insurance" boolean DEFAULT true NOT NULL,
	"status" "info_status" NOT NULL,
	"source_id" uuid,
	"source_type" "source_type" NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"model_scope" text[],
	"version_scope" text[],
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"conversation_id" uuid,
	"due_at" timestamp with time zone,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" "actor_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"insurer" text NOT NULL,
	"coverage" text NOT NULL,
	"annual_premium" numeric(14, 2),
	"pct_of_vehicle_price" numeric(8, 6),
	"status" "info_status" NOT NULL,
	"source_id" uuid,
	"source_type" "source_type" NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"model_scope" text[],
	"version_scope" text[],
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"category" "knowledge_category" NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"structured" jsonb,
	"keywords" text[],
	"status" "info_status" NOT NULL,
	"source_id" uuid,
	"source_type" "source_type" NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"model_scope" text[],
	"version_scope" text[],
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"reference" text,
	"received_at" timestamp with time zone,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mario_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"conversation_id" uuid,
	"agent_run_id" uuid,
	"trigger" "escalation_trigger" NOT NULL,
	"title" text DEFAULT '🔥 MARIO, ENTRA TÚ' NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"seq" bigserial NOT NULL,
	"sender" "message_sender" NOT NULL,
	"body" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"rule_type" text NOT NULL,
	"name" text NOT NULL,
	"condition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effect" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"status" "info_status" NOT NULL,
	"source_id" uuid,
	"source_type" "source_type" NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"model_scope" text[],
	"version_scope" text[],
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"financing_rule_id" uuid,
	"vehicle_price" numeric(14, 2) NOT NULL,
	"down_payment" numeric(14, 2) NOT NULL,
	"term_months" integer NOT NULL,
	"monthly_payment" numeric(14, 2) NOT NULL,
	"annual_rate" numeric(8, 6),
	"bonus" numeric(14, 2) DEFAULT 0 NOT NULL,
	"opening_commission" numeric(14, 2),
	"insurance" numeric(14, 2),
	"plates" numeric(14, 2),
	"other_concepts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conditions" text,
	"status" "info_status" NOT NULL,
	"source_id" uuid,
	"source_type" "source_type" NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"model_scope" text[],
	"version_scope" text[],
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"conversation_id" uuid,
	"vehicle_id" uuid,
	"version_id" uuid,
	"calculation_type" "quote_calculation_type" NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"vehicle_price" numeric(14, 2) NOT NULL,
	"down_payment" numeric(14, 2) NOT NULL,
	"term_months" integer,
	"monthly_payment" numeric(14, 2),
	"annual_rate" numeric(8, 6),
	"bonus" numeric(14, 2) DEFAULT 0 NOT NULL,
	"bonus_offer_id" uuid,
	"opening_commission" numeric(14, 2),
	"insurance" numeric(14, 2),
	"plates" numeric(14, 2),
	"other_concepts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conditions" text,
	"valid_until" timestamp with time zone,
	"source_id" uuid,
	"template_id" uuid,
	"financing_rule_id" uuid,
	"calculation_trace" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" "actor_type" NOT NULL,
	"agent_run_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_official_requires_mario_and_source" CHECK ("quotes"."calculation_type" <> 'official' OR ("quotes"."created_by" = 'mario' AND "quotes"."source_id" IS NOT NULL)),
	CONSTRAINT "quotes_template_requires_template_id" CHECK ("quotes"."calculation_type" <> 'validated_template' OR "quotes"."template_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"role" text DEFAULT 'advisor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"name" text NOT NULL,
	"powertrain" text NOT NULL,
	"transmission" text,
	"seats" integer,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"status" "info_status" NOT NULL,
	"source_id" uuid,
	"source_type" "source_type" NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"model_scope" text[],
	"version_scope" text[],
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand" text DEFAULT 'Honda' NOT NULL,
	"model" text NOT NULL,
	"model_year" integer NOT NULL,
	"segment" text,
	"aliases" text[],
	"active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_inbound_message_id_messages_id_fk" FOREIGN KEY ("inbound_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_reply_message_id_messages_id_fk" FOREIGN KEY ("reply_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_offers" ADD CONSTRAINT "commercial_offers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_offers" ADD CONSTRAINT "commercial_offers_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_offers" ADD CONSTRAINT "commercial_offers_version_id_vehicle_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."vehicle_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_offers" ADD CONSTRAINT "commercial_offers_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_states" ADD CONSTRAINT "crm_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_states" ADD CONSTRAINT "crm_states_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_facts" ADD CONSTRAINT "customer_facts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_facts" ADD CONSTRAINT "customer_facts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_facts" ADD CONSTRAINT "customer_facts_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_summaries" ADD CONSTRAINT "customer_summaries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_summaries" ADD CONSTRAINT "customer_summaries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tags" ADD CONSTRAINT "customer_tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tags" ADD CONSTRAINT "customer_tags_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financing_rules" ADD CONSTRAINT "financing_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financing_rules" ADD CONSTRAINT "financing_rules_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_rules" ADD CONSTRAINT "insurance_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_rules" ADD CONSTRAINT "insurance_rules_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mario_alerts" ADD CONSTRAINT "mario_alerts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mario_alerts" ADD CONSTRAINT "mario_alerts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mario_alerts" ADD CONSTRAINT "mario_alerts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_rules" ADD CONSTRAINT "promotion_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_rules" ADD CONSTRAINT "promotion_rules_offer_id_commercial_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."commercial_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_rules" ADD CONSTRAINT "promotion_rules_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_templates" ADD CONSTRAINT "quote_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_templates" ADD CONSTRAINT "quote_templates_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_templates" ADD CONSTRAINT "quote_templates_version_id_vehicle_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."vehicle_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_templates" ADD CONSTRAINT "quote_templates_financing_rule_id_financing_rules_id_fk" FOREIGN KEY ("financing_rule_id") REFERENCES "public"."financing_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_templates" ADD CONSTRAINT "quote_templates_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_version_id_vehicle_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."vehicle_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_bonus_offer_id_commercial_offers_id_fk" FOREIGN KEY ("bonus_offer_id") REFERENCES "public"."commercial_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_template_id_quote_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."quote_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_financing_rule_id_financing_rules_id_fk" FOREIGN KEY ("financing_rule_id") REFERENCES "public"."financing_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_versions" ADD CONSTRAINT "vehicle_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_versions" ADD CONSTRAINT "vehicle_versions_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_versions" ADD CONSTRAINT "vehicle_versions_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_conversation_idx" ON "agent_runs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "appointments_customer_idx" ON "appointments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "approval_requests_status_idx" ON "approval_requests" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "audit_events_customer_idx" ON "audit_events" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "commercial_offers_vehicle_idx" ON "commercial_offers" USING btree ("vehicle_id","offer_type");--> statement-breakpoint
CREATE INDEX "conversations_customer_idx" ON "conversations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "crm_states_customer_idx" ON "crm_states" USING btree ("customer_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_states_one_current_uq" ON "crm_states" USING btree ("customer_id") WHERE "crm_states"."is_current";--> statement-breakpoint
CREATE INDEX "customer_facts_customer_key_idx" ON "customer_facts" USING btree ("customer_id","fact_key","status");--> statement-breakpoint
CREATE INDEX "customer_summaries_customer_idx" ON "customer_summaries" USING btree ("customer_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_tags_active_uq" ON "customer_tags" USING btree ("customer_id","tag") WHERE "customer_tags"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "customers_workspace_idx" ON "customers" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_workspace_phone_uq" ON "customers" USING btree ("workspace_id","phone") WHERE "customers"."phone" is not null;--> statement-breakpoint
CREATE INDEX "documents_customer_idx" ON "documents" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "followups_customer_idx" ON "followups" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_items_workspace_category_idx" ON "knowledge_items" USING btree ("workspace_id","category");--> statement-breakpoint
CREATE INDEX "mario_alerts_status_idx" ON "mario_alerts" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "messages_conversation_seq_idx" ON "messages" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE INDEX "promotion_rules_offer_idx" ON "promotion_rules" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "quotes_customer_idx" ON "quotes" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "users_workspace_idx" ON "users" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_versions_vehicle_name_uq" ON "vehicle_versions" USING btree ("vehicle_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_workspace_model_year_uq" ON "vehicles" USING btree ("workspace_id","model","model_year");