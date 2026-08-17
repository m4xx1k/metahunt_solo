ALTER TABLE "rss_records" ADD COLUMN "content_fingerprint" text;
--> statement-breakpoint
CREATE INDEX "rss_records_content_fingerprint_idx" ON "rss_records" USING btree ("content_fingerprint");
--> statement-breakpoint
CREATE TABLE "extraction_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "spec_hash" text NOT NULL,
  "input_hash" text NOT NULL,
  "status" text NOT NULL,
  "lease_expires_at" timestamp with time zone,
  "data" jsonb,
  "error" text,
  "usage" jsonb,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "baml_version" text NOT NULL,
  "baml_source_hash" text NOT NULL,
  "taxonomy_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "extraction_artifacts_spec_input_unique" UNIQUE("spec_hash", "input_hash"),
  CONSTRAINT "extraction_artifacts_status_check" CHECK ("status" IN ('pending', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "extraction_artifacts_lease_idx" ON "extraction_artifacts" USING btree ("status", "lease_expires_at");
--> statement-breakpoint
CREATE TABLE "exact_content_conflicts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "content_fingerprint" text NOT NULL,
  "vacancy_id" uuid NOT NULL REFERENCES "vacancies"("id"),
  "conflicting_vacancy_id" uuid NOT NULL REFERENCES "vacancies"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "exact_content_conflicts_pair_unique" UNIQUE("content_fingerprint", "vacancy_id", "conflicting_vacancy_id")
);
--> statement-breakpoint
CREATE INDEX "exact_content_conflicts_fingerprint_idx" ON "exact_content_conflicts" USING btree ("content_fingerprint");
