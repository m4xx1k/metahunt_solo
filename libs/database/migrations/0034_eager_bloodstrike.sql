CREATE TABLE "node_slug_aliases" (
	"slug" text NOT NULL,
	"type" "node_type" NOT NULL,
	"node_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "node_slug_aliases_pkey" PRIMARY KEY("slug","type")
);
--> statement-breakpoint
ALTER TABLE "node_slug_aliases" ADD CONSTRAINT "node_slug_aliases_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "node_slug_aliases_node_id_idx" ON "node_slug_aliases" USING btree ("node_id");