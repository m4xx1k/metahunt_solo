ALTER TABLE "analytics_journeys" ADD COLUMN "person_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
UPDATE "analytics_journeys" SET "person_id" = "id";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "person_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
UPDATE "subscriptions" s
SET "person_id" = COALESCE(s."user_id", j."person_id", s."id")
FROM "analytics_journeys" j
WHERE s."journey_id" = j."id";--> statement-breakpoint
UPDATE "subscriptions" SET "person_id" = COALESCE("user_id", "person_id", "id");--> statement-breakpoint
UPDATE "analytics_journeys" j
SET "person_id" = s."user_id"
FROM "subscriptions" s
WHERE s."journey_id" = j."id" AND s."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "analytics_journeys_person_id_idx" ON "analytics_journeys" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "subscriptions_person_id_idx" ON "subscriptions" USING btree ("person_id");
