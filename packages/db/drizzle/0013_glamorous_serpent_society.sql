CREATE TABLE "system_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
