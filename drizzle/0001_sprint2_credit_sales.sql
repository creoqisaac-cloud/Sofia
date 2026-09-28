CREATE TYPE "public"."credit_application_status" AS ENUM('draft', 'missing_information', 'conflict', 'ready_for_review', 'ready_for_signature', 'submitted', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sale_status" AS ENUM('prospect', 'negotiation', 'credit_process', 'approved', 'order_created', 'invoiced', 'delivery_pending', 'delivered', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'employment_letter';--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'credit_application';--> statement-breakpoint
CREATE TABLE "application_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"source_document" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"field_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"calculation_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_calculations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"period_id" uuid,
	"rule_id" uuid,
	"amount" numeric(14, 2),
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trace" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"period_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"paid_at" timestamp with time zone,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"starts_on" timestamp with time zone NOT NULL,
	"ends_on" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"active" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"seq" bigserial NOT NULL,
	"from_status" "credit_application_status",
	"to_status" "credit_application_status" NOT NULL,
	"reason" text,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"template_id" uuid,
	"quote_id" uuid,
	"status" "credit_application_status" DEFAULT 'draft' NOT NULL,
	"status_reason" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" "actor_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"customer_type" text NOT NULL,
	"document_type" "document_type" NOT NULL,
	"required_if" jsonb,
	"description" text,
	"source" text NOT NULL,
	"version" text NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"application_id" uuid,
	"template_id" uuid,
	"kind" text DEFAULT 'credit_application_draft' NOT NULL,
	"storage" jsonb NOT NULL,
	"fields_filled" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fields_skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sources_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sale_record_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"seq" bigserial NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"reason" text,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"quote_id" uuid,
	"credit_application_id" uuid,
	"vehicle_id" uuid,
	"version_id" uuid,
	"customer_name" text NOT NULL,
	"customer_number" text,
	"order_number" text,
	"invoice_number" text,
	"unit_description" text,
	"bonus" numeric(14, 2),
	"down_payment" numeric(14, 2),
	"invoice_value" numeric(14, 2),
	"invoice_date" timestamp with time zone,
	"delivery_date" timestamp with time zone,
	"extras" text,
	"extras_amount" numeric(14, 2),
	"warranty_amount" numeric(14, 2),
	"warranty_years" integer,
	"opening_commission" numeric(14, 2),
	"insurance_amount" numeric(14, 2),
	"bonus_usage" text,
	"agreements" text,
	"status" "sale_status" DEFAULT 'prospect' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_by" "actor_type" NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_facts" ALTER COLUMN "value" SET DATA TYPE text USING "value"::text;--> statement-breakpoint
ALTER TABLE "customer_facts" ALTER COLUMN "status" SET DEFAULT 'observed';--> statement-breakpoint
ALTER TABLE "customer_facts" ADD COLUMN "source_ref_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_facts" ADD COLUMN "source_label" text;--> statement-breakpoint
ALTER TABLE "customer_facts" ADD COLUMN "confirmed_by" uuid;--> statement-breakpoint
ALTER TABLE "customer_facts" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_facts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "credit_application_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "review_notes" text;--> statement-breakpoint
ALTER TABLE "application_templates" ADD CONSTRAINT "application_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_templates" ADD CONSTRAINT "application_templates_institution_id_credit_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."credit_institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_adjustments" ADD CONSTRAINT "commission_adjustments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_adjustments" ADD CONSTRAINT "commission_adjustments_calculation_id_commission_calculations_id_fk" FOREIGN KEY ("calculation_id") REFERENCES "public"."commission_calculations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_adjustments" ADD CONSTRAINT "commission_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_calculations" ADD CONSTRAINT "commission_calculations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_calculations" ADD CONSTRAINT "commission_calculations_sale_id_sale_records_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_calculations" ADD CONSTRAINT "commission_calculations_period_id_commission_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."commission_periods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_calculations" ADD CONSTRAINT "commission_calculations_rule_id_commission_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."commission_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_period_id_commission_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."commission_periods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_periods" ADD CONSTRAINT "commission_periods_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_application_events" ADD CONSTRAINT "credit_application_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_application_events" ADD CONSTRAINT "credit_application_events_application_id_credit_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."credit_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_institution_id_credit_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."credit_institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_template_id_application_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."application_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_institutions" ADD CONSTRAINT "credit_institutions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_institution_id_credit_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."credit_institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_application_id_credit_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."credit_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_template_id_application_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."application_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_record_changes" ADD CONSTRAINT "sale_record_changes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_record_changes" ADD CONSTRAINT "sale_record_changes_sale_id_sale_records_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_credit_application_id_credit_applications_id_fk" FOREIGN KEY ("credit_application_id") REFERENCES "public"."credit_applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_version_id_vehicle_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."vehicle_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_application_events_app_idx" ON "credit_application_events" USING btree ("application_id","seq");--> statement-breakpoint
CREATE INDEX "credit_applications_customer_idx" ON "credit_applications" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_institutions_ws_code_uq" ON "credit_institutions" USING btree ("workspace_id","code");--> statement-breakpoint
CREATE INDEX "generated_documents_app_idx" ON "generated_documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "sale_record_changes_sale_idx" ON "sale_record_changes" USING btree ("sale_id","seq");--> statement-breakpoint
CREATE INDEX "sale_records_ws_status_idx" ON "sale_records" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "sale_records_customer_idx" ON "sale_records" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "customer_facts" ADD CONSTRAINT "customer_facts_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Datos de Sprint 1: el estado "active" de customer_facts pasa a llamarse "observed" (mismo significado).
UPDATE "customer_facts" SET "status" = 'observed' WHERE "status" = 'active';--> statement-breakpoint
-- Vocabulario documental de Sprint 2: "validated" → "accepted".
UPDATE "documents" SET "status" = 'accepted' WHERE "status" = 'validated';
