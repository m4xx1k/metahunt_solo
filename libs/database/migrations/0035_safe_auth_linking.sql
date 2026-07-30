ALTER TABLE "telegram_login_requests" ADD COLUMN "link_user_id" uuid;--> statement-breakpoint
ALTER TABLE "telegram_login_requests" ADD COLUMN "failure" text;--> statement-breakpoint
ALTER TABLE "telegram_login_requests" ADD CONSTRAINT "telegram_login_requests_link_user_id_users_id_fk" FOREIGN KEY ("link_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
