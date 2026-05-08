CREATE TYPE "public"."node_status" AS ENUM('NEW', 'VERIFIED', 'HIDDEN');--> statement-breakpoint
CREATE TYPE "public"."node_type" AS ENUM('ROLE', 'SKILL', 'DOMAIN');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('USD', 'EUR', 'UAH');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE', 'INTERNSHIP');--> statement-breakpoint
CREATE TYPE "public"."engagement_type" AS ENUM('PRODUCT', 'OUTSOURCE', 'OUTSTAFF', 'STARTUP', 'AGENCY');--> statement-breakpoint
CREATE TYPE "public"."english_level" AS ENUM('BEGINNER', 'INTERMEDIATE', 'UPPER_INTERMEDIATE', 'ADVANCED', 'NATIVE');--> statement-breakpoint
CREATE TYPE "public"."seniority" AS ENUM('INTERN', 'JUNIOR', 'MIDDLE', 'SENIOR', 'LEAD', 'PRINCIPAL', 'C_LEVEL');--> statement-breakpoint
CREATE TYPE "public"."work_format" AS ENUM('REMOTE', 'OFFICE', 'HYBRID');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "company_identifiers" (
	"source_id" uuid NOT NULL,
	"source_company_name" text NOT NULL,
	"company_id" uuid NOT NULL,
	CONSTRAINT "company_identifiers_source_id_source_company_name_pk" PRIMARY KEY("source_id","source_company_name")
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "node_type" NOT NULL,
	"canonical_name" text NOT NULL,
	"status" "node_status" DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nodes_type_canonical_name_key" UNIQUE("type","canonical_name")
);
--> statement-breakpoint
CREATE TABLE "node_aliases" (
	"name" text PRIMARY KEY NOT NULL,
	"node_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vacancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"last_rss_record_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"company_id" uuid,
	"role_node_id" uuid,
	"domain_node_id" uuid,
	"seniority" "seniority",
	"work_format" "work_format",
	"employment_type" "employment_type",
	"english_level" "english_level",
	"experience_years" integer,
	"salary_min" integer,
	"salary_max" integer,
	"currency" "currency",
	"engagement_type" "engagement_type",
	"has_test_assignment" boolean,
	"has_reservation" boolean,
	"locations" jsonb,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vacancies_source_external_key" UNIQUE("source_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "vacancy_nodes" (
	"vacancy_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	CONSTRAINT "vacancy_nodes_vacancy_id_node_id_pk" PRIMARY KEY("vacancy_id","node_id")
);
--> statement-breakpoint
ALTER TABLE "company_identifiers" ADD CONSTRAINT "company_identifiers_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_identifiers" ADD CONSTRAINT "company_identifiers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_aliases" ADD CONSTRAINT "node_aliases_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_last_rss_record_id_rss_records_id_fk" FOREIGN KEY ("last_rss_record_id") REFERENCES "public"."rss_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_role_node_id_nodes_id_fk" FOREIGN KEY ("role_node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_domain_node_id_nodes_id_fk" FOREIGN KEY ("domain_node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancy_nodes" ADD CONSTRAINT "vacancy_nodes_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancy_nodes" ADD CONSTRAINT "vacancy_nodes_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_identifiers_company_id_idx" ON "company_identifiers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "nodes_status_type_idx" ON "nodes" USING btree ("status","type");--> statement-breakpoint
CREATE INDEX "node_aliases_node_id_idx" ON "node_aliases" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "vacancies_company_id_idx" ON "vacancies" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "vacancies_role_node_id_idx" ON "vacancies" USING btree ("role_node_id");--> statement-breakpoint
CREATE INDEX "vacancies_loaded_at_idx" ON "vacancies" USING btree ("loaded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "vacancy_nodes_node_id_idx" ON "vacancy_nodes" USING btree ("node_id");