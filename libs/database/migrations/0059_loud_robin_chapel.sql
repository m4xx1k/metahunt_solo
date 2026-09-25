CREATE TABLE "dedup_overrides" (
	"vacancy_a" uuid NOT NULL,
	"vacancy_b" uuid NOT NULL,
	"verdict" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "dedup_overrides_vacancy_a_vacancy_b_pk" PRIMARY KEY("vacancy_a","vacancy_b"),
	CONSTRAINT "dedup_overrides_ordered_pair" CHECK ("dedup_overrides"."vacancy_a" < "dedup_overrides"."vacancy_b"),
	CONSTRAINT "dedup_overrides_verdict" CHECK ("dedup_overrides"."verdict" = 'different')
);
--> statement-breakpoint
ALTER TABLE "dedup_overrides" ADD CONSTRAINT "dedup_overrides_vacancy_a_vacancies_id_fk" FOREIGN KEY ("vacancy_a") REFERENCES "public"."vacancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dedup_overrides" ADD CONSTRAINT "dedup_overrides_vacancy_b_vacancies_id_fk" FOREIGN KEY ("vacancy_b") REFERENCES "public"."vacancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dedup_overrides" ADD CONSTRAINT "dedup_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;