import { jsonb, pgTable, primaryKey, timestamp, uuid, integer, boolean } from "drizzle-orm/pg-core";

// Immutable, position-grain market observation. `positions` is a live view;
// each capture stores its complete row as JSON so a later canonical-posting or
// taxonomy change cannot rewrite what the market looked like at `asOf`.
export const marketSnapshots = pgTable("market_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull().defaultNow(),
  positionCount: integer("position_count").notNull(),
  positionNodeCount: integer("position_node_count").notNull(),
});

export const marketSnapshotPositions = pgTable(
  "market_snapshot_positions",
  {
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => marketSnapshots.id),
    positionId: uuid("position_id").notNull(),
    position: jsonb("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.snapshotId, t.positionId] })],
);

export const marketSnapshotPositionNodes = pgTable(
  "market_snapshot_position_nodes",
  {
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => marketSnapshots.id),
    positionId: uuid("position_id").notNull(),
    nodeId: uuid("node_id").notNull(),
    isRequired: boolean("is_required").notNull(),
  },
  (t) => [primaryKey({ columns: [t.snapshotId, t.positionId, t.nodeId] })],
);

export type MarketSnapshot = typeof marketSnapshots.$inferSelect;
