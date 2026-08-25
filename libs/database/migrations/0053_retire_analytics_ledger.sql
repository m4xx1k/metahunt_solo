-- Phase 4 of analytics-one-identity: PostHog is the only analytics store.
-- `subscriptions.journey_id` keeps its values and loses only the foreign key —
-- it is what ties an anonymous visit's `?j=` tap to a subscriber in PostHog.
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_journey_id_analytics_journeys_id_fk";
--> statement-breakpoint
DROP TABLE IF EXISTS "product_events" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "analytics_outbox" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "analytics_journeys" CASCADE;
