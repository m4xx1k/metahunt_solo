ALTER TABLE "node_aliases" DROP CONSTRAINT "node_aliases_pkey";--> statement-breakpoint
ALTER TABLE "node_aliases" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "node_aliases" ADD CONSTRAINT "node_aliases_pkey" PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "node_aliases" ADD COLUMN "type" "node_type";--> statement-breakpoint
UPDATE "node_aliases" SET "type" = "nodes"."type" FROM "nodes" WHERE "node_aliases"."node_id" = "nodes"."id";--> statement-breakpoint
ALTER TABLE "node_aliases" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "node_aliases" ADD CONSTRAINT "node_aliases_name_type_key" UNIQUE("name","type");
