CREATE TABLE "music_operations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "music_operations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"guild_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"resulting_revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "music_queue_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"canonical_metadata" jsonb NOT NULL,
	"requester_id" text NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"match_source" text,
	"match_confidence" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "music_sessions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"current_entry_id" text,
	"checkpoint_position_ms" integer DEFAULT 0 NOT NULL,
	"checkpointed_at" timestamp with time zone,
	"volume" integer DEFAULT 100 NOT NULL,
	"repeat_mode" text DEFAULT 'off' NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assigned_node_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "music_sessions_guild_id_unique" UNIQUE("guild_id")
);
--> statement-breakpoint
ALTER TABLE "music_operations" ADD CONSTRAINT "music_operations_guild_id_music_sessions_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."music_sessions"("guild_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_queue_entries" ADD CONSTRAINT "music_queue_entries_guild_id_music_sessions_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."music_sessions"("guild_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "music_operations_guild_operation_idx" ON "music_operations" USING btree ("guild_id","operation_id");--> statement-breakpoint
CREATE INDEX "music_operations_guild_revision_idx" ON "music_operations" USING btree ("guild_id","resulting_revision");--> statement-breakpoint
CREATE INDEX "music_queue_entries_guild_position_idx" ON "music_queue_entries" USING btree ("guild_id","position");