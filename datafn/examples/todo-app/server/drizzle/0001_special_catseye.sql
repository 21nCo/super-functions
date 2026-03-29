DROP INDEX "todos_created_at_idx";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "updated_at" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "kv" ADD COLUMN "created_at" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kv" ADD COLUMN "updated_at" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kv" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "kv" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "trashed_at" bigint;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "trashed_by" text;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "updated_by" text;
