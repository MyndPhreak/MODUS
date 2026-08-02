CREATE TABLE "reminders" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text,
	"channel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reminder" text NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message_id" text,
	"message_url" text,
	"quoted_content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "reminders_user_id_idx" ON "reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reminders_pending_remind_at_idx" ON "reminders" USING btree ("status","remind_at") WHERE status = 'pending';