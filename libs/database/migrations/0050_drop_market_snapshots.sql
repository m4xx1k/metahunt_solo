DROP TABLE "market_snapshot_position_nodes" CASCADE;--> statement-breakpoint
DROP TABLE "market_snapshot_positions" CASCADE;--> statement-breakpoint
DROP TABLE "market_snapshots" CASCADE;--> statement-breakpoint
DROP FUNCTION IF EXISTS "public"."reject_market_snapshot_mutation"();
