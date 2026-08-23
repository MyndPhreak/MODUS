CREATE TABLE "admin_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"actor_display" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"reason" text,
	"reason_required" boolean DEFAULT false NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_audit_events_created_at_id_idx" ON "admin_audit_events" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_audit_events_actor_created_at_idx" ON "admin_audit_events" USING btree ("actor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_audit_events_action_created_at_idx" ON "admin_audit_events" USING btree ("action","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_audit_events_target_created_at_idx" ON "admin_audit_events" USING btree ("target_type","target_id","created_at" DESC NULLS LAST);