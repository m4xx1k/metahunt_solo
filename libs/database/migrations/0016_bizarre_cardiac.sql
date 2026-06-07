CREATE TABLE "candidate_nodes" (
	"candidate_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	CONSTRAINT "candidate_nodes_candidate_id_node_id_pk" PRIMARY KEY("candidate_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_hash" text NOT NULL,
	"source_text" text NOT NULL,
	"extracted" jsonb NOT NULL,
	"role" text,
	"seniority" "seniority",
	"english_level" "english_level",
	"experience_years" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_content_hash_key" UNIQUE("content_hash")
);
--> statement-breakpoint
ALTER TABLE "candidate_nodes" ADD CONSTRAINT "candidate_nodes_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_nodes" ADD CONSTRAINT "candidate_nodes_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_nodes_node_id_idx" ON "candidate_nodes" USING btree ("node_id");