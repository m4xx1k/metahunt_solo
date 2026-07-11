CREATE TABLE "cv_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"vacancy_id" text,
	"kind" text DEFAULT 'tailored' NOT NULL,
	"payload" jsonb NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "structured" jsonb;--> statement-breakpoint
ALTER TABLE "cv_variants" ADD CONSTRAINT "cv_variants_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cv_variants_candidate_id_idx" ON "cv_variants" USING btree ("candidate_id");