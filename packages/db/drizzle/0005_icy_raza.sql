CREATE TABLE "poll_templates" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"question" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_hours" integer DEFAULT 24 NOT NULL,
	"allow_multiselect" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"template_id" text,
	"question" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finalized" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"source" text DEFAULT 'slash' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_template_id_poll_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."poll_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "poll_templates_guild_id_idx" ON "poll_templates" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "polls_guild_active_idx" ON "polls" USING btree ("guild_id","expires_at") WHERE finalized = false;--> statement-breakpoint
CREATE UNIQUE INDEX "polls_message_id_idx" ON "polls" USING btree ("message_id");