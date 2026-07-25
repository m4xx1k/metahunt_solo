ALTER TABLE "subscriptions" ADD COLUMN "deactivated_reason" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "unreachable_count" integer DEFAULT 0 NOT NULL;