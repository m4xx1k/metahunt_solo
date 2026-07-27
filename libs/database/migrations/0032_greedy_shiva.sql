CREATE TABLE "telegram_login_requests" (
	"nonce" text PRIMARY KEY NOT NULL,
	"poll_secret_hash" text NOT NULL,
	"verification_code" text NOT NULL,
	"user_id" uuid,
	"is_new_user" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "telegram_login_requests" ADD CONSTRAINT "telegram_login_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_login_requests_expires_at_idx" ON "telegram_login_requests" USING btree ("expires_at");