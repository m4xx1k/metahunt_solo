CREATE TABLE "analytics_journeys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"origin" text DEFAULT 'browser' NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"cohort_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" uuid NOT NULL,
	"subscription_id" uuid,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "analytics_outbox_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "digest_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"vacancies" integer NOT NULL,
	"matched_vacancies" integer NOT NULL,
	"pages" integer NOT NULL,
	"sent_vacancies" integer DEFAULT 0 NOT NULL,
	"sent_pages" integer DEFAULT 0 NOT NULL,
	"is_first_digest" boolean NOT NULL,
	"profile_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" uuid NOT NULL,
	"subscription_id" uuid,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"dedupe_key" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_events_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "journey_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
INSERT INTO "analytics_journeys" ("id", "origin", "created_at", "last_seen_at")
SELECT "id", 'legacy_subscription', "created_at", "created_at"
FROM "subscriptions"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "subscriptions"
SET "journey_id" = "id"
WHERE "journey_id" IS NULL;--> statement-breakpoint
UPDATE "subscriptions" s
SET "user_id" = ai."user_id"
FROM "auth_identities" ai
WHERE s."user_id" IS NULL
	AND ai."provider" = 'telegram'
	AND ai."provider_user_id" = s."chat_id";--> statement-breakpoint
ALTER TABLE "analytics_outbox" ADD CONSTRAINT "analytics_outbox_journey_id_analytics_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."analytics_journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_outbox" ADD CONSTRAINT "analytics_outbox_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_deliveries" ADD CONSTRAINT "digest_deliveries_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_journey_id_analytics_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."analytics_journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_journeys_created_at_idx" ON "analytics_journeys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "analytics_outbox_pending_idx" ON "analytics_outbox" USING btree ("processed_at","created_at");--> statement-breakpoint
CREATE INDEX "digest_deliveries_subscription_status_idx" ON "digest_deliveries" USING btree ("subscription_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "digest_deliveries_one_pending_idx" ON "digest_deliveries" USING btree ("subscription_id") WHERE "digest_deliveries"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "product_events_journey_occurred_idx" ON "product_events" USING btree ("journey_id","occurred_at");--> statement-breakpoint
CREATE INDEX "product_events_subscription_occurred_idx" ON "product_events" USING btree ("subscription_id","occurred_at");--> statement-breakpoint
CREATE INDEX "product_events_name_occurred_idx" ON "product_events" USING btree ("name","occurred_at");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_journey_id_analytics_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."analytics_journeys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_journey_id_idx" ON "subscriptions" USING btree ("journey_id");--> statement-breakpoint
CREATE INDEX "subscriptions_created_at_idx" ON "subscriptions" USING btree ("created_at");
