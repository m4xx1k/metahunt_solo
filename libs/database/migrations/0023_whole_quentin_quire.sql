CREATE TYPE "public"."candidate_type" AS ENUM('user', 'sample');--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "type" "candidate_type" DEFAULT 'user' NOT NULL;