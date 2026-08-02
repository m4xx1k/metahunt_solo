CREATE TABLE "account_merge_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "account_merge_requests_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "account_merge_requests" ADD CONSTRAINT "account_merge_requests_source_user_id_users_id_fk" FOREIGN KEY ("source_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_merge_requests_expires_at_idx" ON "account_merge_requests" USING btree ("expires_at");