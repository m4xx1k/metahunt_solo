CREATE TABLE "rss_ingests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"triggered_by" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"payload_storage_key" text,
	"status" text DEFAULT 'running' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rss_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"rss_ingest_id" uuid NOT NULL,
	"external_id" text,
	"hash" text NOT NULL,
	"published_at" timestamp with time zone,
	"title" text NOT NULL,
	"description" text,
	"link" text,
	"category" text,
	"extracted_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rss_records_source_id_hash_unique" UNIQUE("source_id","hash")
);
--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "rss_url" text;--> statement-breakpoint
ALTER TABLE "rss_ingests" ADD CONSTRAINT "rss_ingests_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rss_records" ADD CONSTRAINT "rss_records_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rss_records" ADD CONSTRAINT "rss_records_rss_ingest_id_rss_ingests_id_fk" FOREIGN KEY ("rss_ingest_id") REFERENCES "public"."rss_ingests"("id") ON DELETE no action ON UPDATE no action;