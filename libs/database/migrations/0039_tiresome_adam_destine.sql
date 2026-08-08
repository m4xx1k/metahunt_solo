ALTER TABLE "vacancies" ADD COLUMN "deduplicated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "unique_vacancies" ADD COLUMN "first_loaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "unique_vacancies" ADD COLUMN "representative_vacancy_id" uuid;--> statement-breakpoint
ALTER TABLE "unique_vacancies" ADD CONSTRAINT "unique_vacancies_representative_vacancy_id_vacancies_id_fk" FOREIGN KEY ("representative_vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vacancies_pending_dedup_idx" ON "vacancies" USING btree ("id") WHERE "vacancies"."deduplicated_at" IS NULL;--> statement-breakpoint
CREATE INDEX "unique_vacancies_last_seen_idx" ON "unique_vacancies" USING btree ("last_seen_at" DESC NULLS LAST);--> statement-breakpoint
-- Backfill, hand-added to the generated migration: a column that ships empty is
-- a trap, and these are cheap (one pass each over ~15k rows).

-- Everything already grouped has been through the sweep. `updated_at` is the
-- closest honest approximation of when; the transient unresolved rows stay NULL
-- and the sweep will stamp them.
UPDATE "vacancies"
SET "deduplicated_at" = "updated_at"
WHERE "unique_vacancy_id" IS NOT NULL;--> statement-breakpoint

WITH member_agg AS (
  SELECT v.unique_vacancy_id AS group_id,
         MIN(v.loaded_at)    AS first_loaded_at
  FROM vacancies v
  WHERE v.unique_vacancy_id IS NOT NULL
  GROUP BY v.unique_vacancy_id
),
representative AS (
  SELECT DISTINCT ON (v.unique_vacancy_id)
         v.unique_vacancy_id AS group_id,
         v.id                AS rep_id
  FROM vacancies v
  WHERE v.unique_vacancy_id IS NOT NULL
  ORDER BY v.unique_vacancy_id, COALESCE(v.published_at, v.loaded_at) DESC, v.id
)
UPDATE unique_vacancies u
SET first_loaded_at           = a.first_loaded_at,
    representative_vacancy_id = r.rep_id
FROM member_agg a
JOIN representative r USING (group_id)
WHERE u.id = a.group_id;