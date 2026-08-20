CREATE TABLE "module_access" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text NOT NULL,
	"module_name" text NOT NULL,
	"role_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "module_access_guild_module_idx" ON "module_access" USING btree ("guild_id","module_name");--> statement-breakpoint
CREATE INDEX "module_access_guild_id_idx" ON "module_access" USING btree ("guild_id");