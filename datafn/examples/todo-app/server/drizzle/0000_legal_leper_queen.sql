CREATE TABLE "__datafn_join_todos_tags" (
	"__ns" text NOT NULL,
	"from" text NOT NULL,
	"id" text NOT NULL,
	"to" text NOT NULL,
	CONSTRAINT "__datafn_join_todos_tags___ns_id_pk" PRIMARY KEY("__ns","id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"__ns" text NOT NULL,
	"color" text DEFAULT '#646cff' NOT NULL,
	"created_at" bigint NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "categories___ns_id_pk" PRIMARY KEY("__ns","id")
);
--> statement-breakpoint
CREATE TABLE "kv" (
	"__ns" text NOT NULL,
	"id" text NOT NULL,
	"value" jsonb,
	CONSTRAINT "kv___ns_id_pk" PRIMARY KEY("__ns","id")
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"__ns" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL,
	"id" text NOT NULL,
	"priority" numeric DEFAULT 3,
	"text" text NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "todos___ns_id_pk" PRIMARY KEY("__ns","id")
);
--> statement-breakpoint
CREATE INDEX "idx___datafn_join_todos_tags___ns" ON "__datafn_join_todos_tags" USING btree ("__ns");--> statement-breakpoint
CREATE UNIQUE INDEX "__datafn_join_todos_tags_from_to_idx" ON "__datafn_join_todos_tags" USING btree ("from","to");--> statement-breakpoint
CREATE INDEX "idx_categories___ns" ON "categories" USING btree ("__ns");--> statement-breakpoint
CREATE INDEX "categories_name_idx" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_kv___ns" ON "kv" USING btree ("__ns");--> statement-breakpoint
CREATE INDEX "idx_todos___ns" ON "todos" USING btree ("__ns");--> statement-breakpoint
CREATE INDEX "todos_completed_idx" ON "todos" USING btree ("completed");--> statement-breakpoint
CREATE INDEX "todos_created_at_idx" ON "todos" USING btree ("created_at");