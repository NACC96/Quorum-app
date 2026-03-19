CREATE TABLE "council_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"question" text NOT NULL,
	"status" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliberation_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"question" text NOT NULL,
	"phase" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
