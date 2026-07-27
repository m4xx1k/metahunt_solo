CREATE TYPE "public"."ats_type" AS ENUM('ashby', 'greenhouse', 'lever', 'hurma');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('rss', 'ats');--> statement-breakpoint
CREATE TYPE "public"."salary_source" AS ENUM('ATS_STRUCTURED', 'LLM_TEXT');--> statement-breakpoint
ALTER TYPE "public"."currency" ADD VALUE 'GBP';--> statement-breakpoint
ALTER TYPE "public"."currency" ADD VALUE 'PLN';--> statement-breakpoint
ALTER TYPE "public"."currency" ADD VALUE 'CAD';--> statement-breakpoint
ALTER TYPE "public"."currency" ADD VALUE 'INR';--> statement-breakpoint
ALTER TYPE "public"."currency" ADD VALUE 'COP';--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "kind" "source_kind" DEFAULT 'rss' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "ats_type" "ats_type";--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "ats_slug" text;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "salary_source" "salary_source";--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "salary_raw" text;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "closed_at" timestamp with time zone;