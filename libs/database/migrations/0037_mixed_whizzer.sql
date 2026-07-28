CREATE TYPE "public"."salary_period" AS ENUM('HOUR', 'MONTH', 'YEAR');--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "salary_period" "salary_period";