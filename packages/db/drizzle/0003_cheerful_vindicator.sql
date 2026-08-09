ALTER TABLE "modules" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "tags" text[] DEFAULT ARRAY[]::text[] NOT NULL;