CREATE TABLE "outbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"conversation_id" uuid,
	"directive_id" uuid,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"media_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"due_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"column_id" uuid,
	"period" text NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_cards_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "pipeline_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'gray' NOT NULL,
	"temperature" "temperature",
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sofia_directives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"text" text NOT NULL,
	"plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"recipients" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"version_name" text,
	"unit_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"caption" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"send_on_ask" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"valid_to" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"version_name" text,
	"color" text,
	"model_year" integer,
	"status" text DEFAULT 'available' NOT NULL,
	"price" numeric(14, 2),
	"notes" text,
	"reserved_for_customer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"kind" text DEFAULT 'novedad' NOT NULL,
	"text" text NOT NULL,
	"valid_to" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_directive_id_sofia_directives_id_fk" FOREIGN KEY ("directive_id") REFERENCES "public"."sofia_directives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_cards" ADD CONSTRAINT "pipeline_cards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_cards" ADD CONSTRAINT "pipeline_cards_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_cards" ADD CONSTRAINT "pipeline_cards_column_id_pipeline_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."pipeline_columns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_columns" ADD CONSTRAINT "pipeline_columns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sofia_directives" ADD CONSTRAINT "sofia_directives_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_media" ADD CONSTRAINT "vehicle_media_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_media" ADD CONSTRAINT "vehicle_media_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_media" ADD CONSTRAINT "vehicle_media_unit_id_vehicle_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."vehicle_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_units" ADD CONSTRAINT "vehicle_units_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_units" ADD CONSTRAINT "vehicle_units_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_units" ADD CONSTRAINT "vehicle_units_reserved_for_customer_id_customers_id_fk" FOREIGN KEY ("reserved_for_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_updates" ADD CONSTRAINT "vehicle_updates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_updates" ADD CONSTRAINT "vehicle_updates_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_messages_ws_status_idx" ON "outbox_messages" USING btree ("workspace_id","status","due_at");--> statement-breakpoint
CREATE INDEX "outbox_messages_customer_idx" ON "outbox_messages" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "pipeline_cards_ws_idx" ON "pipeline_cards" USING btree ("workspace_id","column_id");--> statement-breakpoint
CREATE INDEX "pipeline_columns_ws_idx" ON "pipeline_columns" USING btree ("workspace_id","sort_order");--> statement-breakpoint
CREATE INDEX "sofia_directives_ws_idx" ON "sofia_directives" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "vehicle_media_ws_vehicle_idx" ON "vehicle_media" USING btree ("workspace_id","vehicle_id","active");--> statement-breakpoint
CREATE INDEX "vehicle_units_ws_vehicle_idx" ON "vehicle_units" USING btree ("workspace_id","vehicle_id","status");--> statement-breakpoint
CREATE INDEX "vehicle_updates_ws_vehicle_idx" ON "vehicle_updates" USING btree ("workspace_id","vehicle_id","active");