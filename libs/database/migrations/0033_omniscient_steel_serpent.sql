ALTER TABLE "auth_identities" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_provider_key" UNIQUE("user_id","provider");