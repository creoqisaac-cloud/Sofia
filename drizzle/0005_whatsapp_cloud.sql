CREATE TABLE IF NOT EXISTS "whatsapp_inbound_events" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "phone" text NOT NULL,
  "state" text DEFAULT 'received' NOT NULL,
  "inbound_message_id" uuid REFERENCES "messages"("id") ON DELETE SET NULL,
  "reply_message_id" uuid REFERENCES "messages"("id") ON DELETE SET NULL,
  "outbound_message_id" text,
  "lease_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messages_whatsapp_id_uq" ON "messages" ((metadata ->> 'whatsappMessageId'))
  WHERE metadata ? 'whatsappMessageId';
