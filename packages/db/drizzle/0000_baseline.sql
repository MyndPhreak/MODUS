CREATE TABLE "ai_usage_log" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"estimated_cost" double precision,
	"action" text DEFAULT 'chat' NOT NULL,
	"key_source" text,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automod_rules" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"trigger" text NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exempt_roles" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"exempt_channels" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"cooldown" integer,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_status" (
	"id" text PRIMARY KEY NOT NULL,
	"bot_id" text NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"version" text,
	"shard_id" integer NOT NULL,
	"total_shards" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_configs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text NOT NULL,
	"module_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text NOT NULL,
	"message" text NOT NULL,
	"level" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"shard_id" integer,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "milestone_users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"char_count" integer DEFAULT 0 NOT NULL,
	"last_milestone" integer DEFAULT 0 NOT NULL,
	"notification_pref" text DEFAULT 'public' NOT NULL,
	"opted_in" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recording_tracks" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"recording_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"file_id" text NOT NULL,
	"file_size" integer,
	"start_offset" integer DEFAULT 0 NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text NOT NULL,
	"channel_name" text NOT NULL,
	"recorded_by" text NOT NULL,
	"title" text,
	"mixed_file_id" text,
	"duration" integer,
	"bitrate" integer,
	"multitrack" boolean DEFAULT false NOT NULL,
	"participants" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"owner_id" text,
	"member_count" integer,
	"status" boolean DEFAULT false NOT NULL,
	"ping" integer,
	"shard_id" integer,
	"last_checked" timestamp with time zone,
	"is_public" boolean DEFAULT false NOT NULL,
	"description" text,
	"invite_link" text,
	"premium" boolean DEFAULT false NOT NULL,
	"admin_user_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"dashboard_role_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text,
	"embed_data" jsonb,
	"allowed_roles" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temp_voice_channels" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"lobby_channel_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"transcript_id" text NOT NULL,
	"discord_message_id" text NOT NULL,
	"author_id" text NOT NULL,
	"author_tag" text NOT NULL,
	"author_avatar_url" text,
	"author_is_bot" boolean DEFAULT false NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"embeds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_transcripts" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"ticket_id" integer NOT NULL,
	"thread_id" text NOT NULL,
	"thread_name" text NOT NULL,
	"opener_id" text NOT NULL,
	"claimed_by_id" text,
	"closed_by_id" text NOT NULL,
	"type_id" text,
	"priority" text NOT NULL,
	"participant_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"message_count" integer DEFAULT 0 NOT NULL,
	"has_skipped_attachments" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_transcripts_thread_id_unique" UNIQUE("thread_id")
);
--> statement-breakpoint
CREATE TABLE "triggers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"secret" text NOT NULL,
	"provider" text NOT NULL,
	"channel_id" text NOT NULL,
	"embed_template" jsonb,
	"filters" jsonb,
	"created_by" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recording_tracks" ADD CONSTRAINT "recording_tracks_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_transcript_id_ticket_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."ticket_transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_log_guild_timestamp_idx" ON "ai_usage_log" USING btree ("guild_id","timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_log_user_timestamp_idx" ON "ai_usage_log" USING btree ("user_id","timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_log_timestamp_idx" ON "ai_usage_log" USING btree ("timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "automod_rules_guild_idx" ON "automod_rules" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "automod_rules_guild_enabled_idx" ON "automod_rules" USING btree ("guild_id","enabled");--> statement-breakpoint
CREATE INDEX "automod_rules_guild_trigger_idx" ON "automod_rules" USING btree ("guild_id","trigger");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_configs_guild_module_idx" ON "guild_configs" USING btree ("guild_id","module_name");--> statement-breakpoint
CREATE INDEX "guild_configs_guild_id_idx" ON "guild_configs" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "guild_configs_module_enabled_idx" ON "guild_configs" USING btree ("module_name","enabled");--> statement-breakpoint
CREATE INDEX "logs_guild_timestamp_idx" ON "logs" USING btree ("guild_id","timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "logs_timestamp_idx" ON "logs" USING btree ("timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "milestone_users_guild_user_idx" ON "milestone_users" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "milestone_users_guild_chars_idx" ON "milestone_users" USING btree ("guild_id","char_count" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "modules_name_idx" ON "modules" USING btree ("name");--> statement-breakpoint
CREATE INDEX "recording_tracks_recording_id_idx" ON "recording_tracks" USING btree ("recording_id");--> statement-breakpoint
CREATE INDEX "recordings_guild_started_at_idx" ON "recordings" USING btree ("guild_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "recordings_started_at_idx" ON "recordings" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "servers_guild_id_idx" ON "servers" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "servers_owner_id_idx" ON "servers" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_guild_name_idx" ON "tags" USING btree ("guild_id","name");--> statement-breakpoint
CREATE INDEX "tags_guild_idx" ON "tags" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "tags_guild_template_idx" ON "tags" USING btree ("guild_id","is_template");--> statement-breakpoint
CREATE UNIQUE INDEX "temp_voice_channels_channel_id_idx" ON "temp_voice_channels" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "temp_voice_channels_guild_idx" ON "temp_voice_channels" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "temp_voice_channels_guild_owner_idx" ON "temp_voice_channels" USING btree ("guild_id","owner_id");--> statement-breakpoint
CREATE INDEX "ticket_messages_transcript_created_idx" ON "ticket_messages" USING btree ("transcript_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_transcripts_guild_closed_idx" ON "ticket_transcripts" USING btree ("guild_id","closed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ticket_transcripts_opener_idx" ON "ticket_transcripts" USING btree ("opener_id");--> statement-breakpoint
CREATE INDEX "ticket_transcripts_expires_idx" ON "ticket_transcripts" USING btree ("expires_at") WHERE expires_at IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "triggers_secret_idx" ON "triggers" USING btree ("secret");--> statement-breakpoint
CREATE UNIQUE INDEX "triggers_guild_name_idx" ON "triggers" USING btree ("guild_id","name");--> statement-breakpoint
CREATE INDEX "triggers_guild_idx" ON "triggers" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "triggers_guild_enabled_idx" ON "triggers" USING btree ("guild_id","enabled");