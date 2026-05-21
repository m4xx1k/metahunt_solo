CREATE TABLE "unique_vacancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_vacancy_id" uuid NOT NULL,
	"centroid_embedding" vector(1536),
	"source_count" integer DEFAULT 1 NOT NULL,
	"vacancy_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "embedding_source_hash" text;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "unique_vacancy_id" uuid;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "dedup_reason" jsonb;--> statement-breakpoint
ALTER TABLE "unique_vacancies" ADD CONSTRAINT "unique_vacancies_canonical_vacancy_id_vacancies_id_fk" FOREIGN KEY ("canonical_vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unique_vacancies_canonical_idx" ON "unique_vacancies" USING btree ("canonical_vacancy_id");--> statement-breakpoint
CREATE INDEX "unique_vacancies_source_count_idx" ON "unique_vacancies" USING btree ("source_count" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_unique_vacancy_id_unique_vacancies_id_fk" FOREIGN KEY ("unique_vacancy_id") REFERENCES "public"."unique_vacancies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vacancies_source_published_idx" ON "vacancies" USING btree ("source_id","published_at");--> statement-breakpoint
CREATE INDEX "vacancies_unique_vacancy_id_idx" ON "vacancies" USING btree ("unique_vacancy_id");--> statement-breakpoint
CREATE INDEX "vacancies_embedding_hnsw_idx" ON "vacancies" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
-- Backfill the denormalized published_at from the originating rss_records.
-- New vacancies get this column set inside VacancyLoaderService; this UPDATE
-- fills in the historic 3-4k rows so dedup pre-filter (sourceId, published_at)
-- works on day 1 without joining rss_records on every ANN call.
UPDATE "vacancies" v
SET "published_at" = rr."published_at"
FROM "rss_records" rr
WHERE rr."id" = v."last_rss_record_id"
  AND v."published_at" IS NULL;