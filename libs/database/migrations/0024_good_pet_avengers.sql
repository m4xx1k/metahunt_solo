ALTER TABLE "nodes" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_type_slug_key" UNIQUE("type","slug");