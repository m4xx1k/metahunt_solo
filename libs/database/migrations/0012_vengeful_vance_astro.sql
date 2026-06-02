CREATE TABLE "track_nodes" (
	"track_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	CONSTRAINT "track_nodes_track_id_node_id_pk" PRIMARY KEY("track_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "tracks_slug_key" UNIQUE("slug"),
	CONSTRAINT "tracks_parent_not_self" CHECK ("tracks"."parent_id" <> "tracks"."id")
);
--> statement-breakpoint
ALTER TABLE "track_nodes" ADD CONSTRAINT "track_nodes_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_nodes" ADD CONSTRAINT "track_nodes_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_parent_id_tracks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "track_nodes_node_id_idx" ON "track_nodes" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "tracks_parent_id_idx" ON "tracks" USING btree ("parent_id");