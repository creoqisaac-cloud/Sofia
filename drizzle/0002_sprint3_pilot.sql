CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid,
	"plate_case_id" uuid,
	"sale_id" uuid,
	"purpose" text NOT NULL,
	"to_address" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"provider" text,
	"provider_message_id" text,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_by" "actor_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lender" text NOT NULL,
	"name" text NOT NULL,
	"calibration_status" text DEFAULT 'unverified' NOT NULL,
	"calibration_report" jsonb,
	"calibrated_at" timestamp with time zone,
	"bonus_application" text,
	"iva_on_interest" boolean,
	"iva_rate" numeric(8, 6),
	"opening_commission_rate" numeric(8, 6),
	"opening_commission_financed" boolean,
	"opening_commission_iva" boolean,
	"insurance_mode" text,
	"min_down_payment_rate" numeric(8, 6),
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
CREATE TABLE "finance_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"term_months" integer NOT NULL,
	"annual_rate" numeric(8, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plate_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"sale_id" uuid,
	"vehicle_label" text,
	"vin" text,
	"status" text DEFAULT 'not_started' NOT NULL,
	"requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_step" text,
	"due_date" timestamp with time zone,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plate_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"label" text NOT NULL,
	"source_label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
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
CREATE TABLE "quote_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"term_months" integer,
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
CREATE TABLE "quote_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid,
	"version_id" uuid,
	"program_id" uuid,
	"vehicle_label" text NOT NULL,
	"down_payment" numeric(14, 2) NOT NULL,
	"term_months" integer NOT NULL,
	"exactness" text NOT NULL,
	"monthly_payment" numeric(14, 2),
	"components" jsonb NOT NULL,
	"missing" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"saved" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" "actor_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"sale_id" uuid,
	"type" text DEFAULT 'por_definir' NOT NULL,
	"reason" text,
	"status" text DEFAULT 'open' NOT NULL,
	"amount" numeric(14, 2),
	"notes" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "validated_quote_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"program_id" uuid,
	"version_id" uuid,
	"label" text NOT NULL,
	"down_payment" numeric(14, 2) NOT NULL,
	"term_months" integer NOT NULL,
	"vehicle_price" numeric(14, 2) NOT NULL,
	"bonus" numeric(14, 2) DEFAULT 0 NOT NULL,
	"insurance" numeric(14, 2),
	"expected" jsonb NOT NULL,
	"quoted_at" timestamp with time zone,
	"source_label" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"price_book_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"list_price" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_template_requires_template_id";--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "status" SET DEFAULT 'scheduled';--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_contact_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "response_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "followups" ADD COLUMN "action" text;--> statement-breakpoint
ALTER TABLE "followups" ADD COLUMN "promised_by_mario" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "followups" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "quote_run_id" uuid;--> statement-breakpoint
ALTER TABLE "sale_records" ADD COLUMN "vin" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_plate_case_id_plate_cases_id_fk" FOREIGN KEY ("plate_case_id") REFERENCES "public"."plate_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_sale_id_sale_records_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_programs" ADD CONSTRAINT "finance_programs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_programs" ADD CONSTRAINT "finance_programs_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_terms" ADD CONSTRAINT "finance_terms_program_id_finance_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."finance_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plate_cases" ADD CONSTRAINT "plate_cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plate_cases" ADD CONSTRAINT "plate_cases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plate_cases" ADD CONSTRAINT "plate_cases_sale_id_sale_records_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plate_requirements" ADD CONSTRAINT "plate_requirements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_books" ADD CONSTRAINT "price_books_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_books" ADD CONSTRAINT "price_books_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_components" ADD CONSTRAINT "quote_components_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_components" ADD CONSTRAINT "quote_components_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_runs" ADD CONSTRAINT "quote_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_runs" ADD CONSTRAINT "quote_runs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_runs" ADD CONSTRAINT "quote_runs_version_id_vehicle_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."vehicle_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_runs" ADD CONSTRAINT "quote_runs_program_id_finance_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."finance_programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_cases" ADD CONSTRAINT "return_cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_cases" ADD CONSTRAINT "return_cases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_cases" ADD CONSTRAINT "return_cases_sale_id_sale_records_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validated_quote_examples" ADD CONSTRAINT "validated_quote_examples_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validated_quote_examples" ADD CONSTRAINT "validated_quote_examples_program_id_finance_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."finance_programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validated_quote_examples" ADD CONSTRAINT "validated_quote_examples_version_id_vehicle_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."vehicle_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_prices" ADD CONSTRAINT "vehicle_prices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_prices" ADD CONSTRAINT "vehicle_prices_price_book_id_price_books_id_fk" FOREIGN KEY ("price_book_id") REFERENCES "public"."price_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_prices" ADD CONSTRAINT "vehicle_prices_version_id_vehicle_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."vehicle_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_messages_customer_idx" ON "email_messages" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_terms_program_term_uq" ON "finance_terms" USING btree ("program_id","term_months");--> statement-breakpoint
CREATE INDEX "plate_cases_customer_idx" ON "plate_cases" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "quote_runs_customer_idx" ON "quote_runs" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_prices_book_version_uq" ON "vehicle_prices" USING btree ("price_book_id","version_id");--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_quote_run_id_quote_runs_id_fk" FOREIGN KEY ("quote_run_id") REFERENCES "public"."quote_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_template_requires_template_id" CHECK ("quotes"."calculation_type" <> 'validated_template' OR "quotes"."template_id" IS NOT NULL OR "quotes"."quote_run_id" IS NOT NULL);--> statement-breakpoint
UPDATE "appointments" SET "status" = 'scheduled' WHERE "status" = 'proposed';--> statement-breakpoint
UPDATE "appointments" SET "status" = 'completed' WHERE "status" = 'done';
