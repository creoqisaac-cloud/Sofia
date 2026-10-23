CREATE TABLE IF NOT EXISTS "biky_booking_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "external_booking_id" text NOT NULL,
  "appointment_id" uuid REFERENCES "appointments"("id") ON DELETE SET NULL,
  "notification_state" text DEFAULT 'pending' NOT NULL,
  "notification_provider_id" text,
  "notification_channel" text,
  "lease_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "biky_bookings_external_uq" ON "biky_booking_receipts" ("workspace_id", "external_booking_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "biky_bookings_workspace_idx" ON "biky_booking_receipts" ("workspace_id");
