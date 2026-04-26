ALTER TABLE "rss_records" ALTER COLUMN "published_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rss_ingests" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "rss_records" ADD COLUMN "extracted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "rss_ingests_source_id_idx" ON "rss_ingests" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "rss_records_source_id_idx" ON "rss_records" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "rss_records_rss_ingest_id_idx" ON "rss_records" USING btree ("rss_ingest_id");--> statement-breakpoint
CREATE INDEX "rss_records_extracted_at_idx" ON "rss_records" USING btree ("extracted_at");