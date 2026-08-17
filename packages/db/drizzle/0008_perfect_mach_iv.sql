CREATE TABLE "giveaway_entries" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"giveaway_id" text NOT NULL,
	"user_id" text NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "giveaways" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"host_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"prize_kind" text NOT NULL,
	"prize_value" text NOT NULL,
	"image_url" text,
	"winner_count" integer DEFAULT 1 NOT NULL,
	"requirements" jsonb DEFAULT '{"requiredRoleIds":[],"blockedRoleIds":[]}'::jsonb NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"winner_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'slash' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "giveaway_entries" ADD CONSTRAINT "giveaway_entries_giveaway_id_giveaways_id_fk" FOREIGN KEY ("giveaway_id") REFERENCES "public"."giveaways"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "giveaway_entries_giveaway_user_idx" ON "giveaway_entries" USING btree ("giveaway_id","user_id");--> statement-breakpoint
CREATE INDEX "giveaways_status_ends_at_idx" ON "giveaways" USING btree ("status","ends_at");--> statement-breakpoint
CREATE INDEX "giveaways_guild_idx" ON "giveaways" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "giveaways_message_id_idx" ON "giveaways" USING btree ("message_id");