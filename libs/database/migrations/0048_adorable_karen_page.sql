CREATE TABLE "market_snapshot_position_nodes" (
	"snapshot_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"is_required" boolean NOT NULL,
	CONSTRAINT "market_snapshot_position_nodes_snapshot_id_position_id_node_id_pk" PRIMARY KEY("snapshot_id","position_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "market_snapshot_positions" (
	"snapshot_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"position" jsonb NOT NULL,
	CONSTRAINT "market_snapshot_positions_snapshot_id_position_id_pk" PRIMARY KEY("snapshot_id","position_id")
);
--> statement-breakpoint
CREATE TABLE "market_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"as_of" timestamp with time zone DEFAULT now() NOT NULL,
	"position_count" integer NOT NULL,
	"position_node_count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_snapshot_position_nodes" ADD CONSTRAINT "market_snapshot_position_nodes_snapshot_id_market_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."market_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_snapshot_positions" ADD CONSTRAINT "market_snapshot_positions_snapshot_id_market_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."market_snapshots"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "market_snapshots_as_of_idx" ON "public"."market_snapshots" USING btree ("as_of" DESC);--> statement-breakpoint
CREATE INDEX "market_snapshot_position_nodes_node_idx" ON "public"."market_snapshot_position_nodes" USING btree ("snapshot_id", "node_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."reject_market_snapshot_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'market snapshots are immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "market_snapshots_immutable" BEFORE UPDATE OR DELETE ON "public"."market_snapshots"
FOR EACH ROW EXECUTE FUNCTION "public"."reject_market_snapshot_mutation"();--> statement-breakpoint
CREATE TRIGGER "market_snapshot_positions_immutable" BEFORE UPDATE OR DELETE ON "public"."market_snapshot_positions"
FOR EACH ROW EXECUTE FUNCTION "public"."reject_market_snapshot_mutation"();--> statement-breakpoint
CREATE TRIGGER "market_snapshot_position_nodes_immutable" BEFORE UPDATE OR DELETE ON "public"."market_snapshot_position_nodes"
FOR EACH ROW EXECUTE FUNCTION "public"."reject_market_snapshot_mutation"();
