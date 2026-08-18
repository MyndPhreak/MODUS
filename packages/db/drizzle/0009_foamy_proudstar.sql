CREATE TABLE "xp_users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"char_count" integer DEFAULT 0 NOT NULL,
	"last_xp_gain_at" timestamp with time zone,
	"notification_pref" text DEFAULT 'public' NOT NULL,
	"opted_in" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "xp_users_guild_user_idx" ON "xp_users" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "xp_users_guild_xp_idx" ON "xp_users" USING btree ("guild_id","xp" DESC NULLS LAST);