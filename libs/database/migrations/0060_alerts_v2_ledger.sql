CREATE TABLE "chat_notifications" (
	"chat_id" text NOT NULL,
	"vacancy_id" uuid NOT NULL,
	"version_at" timestamp with time zone NOT NULL,
	"notified_at" timestamp with time zone,
	"kind" text NOT NULL,
	"subscription_id" uuid,
	"position_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_notifications_chat_id_vacancy_id_pk" PRIMARY KEY("chat_id","vacancy_id")
);
--> statement-breakpoint
-- Two statements, not ADD ... DEFAULT now(): existing rows must stay NULL so
-- alerts v2 lazy-inits them instead of treating them as created at migration time.
ALTER TABLE "subscriptions" ADD COLUMN "alerts_floor_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "alerts_floor_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "alerts_bumps" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_notifications" ADD CONSTRAINT "chat_notifications_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE no action ON UPDATE no action;