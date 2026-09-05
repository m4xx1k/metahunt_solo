import { pgTable, pgEnum, uuid, text, timestamp, unique, index } from "drizzle-orm/pg-core";

export const nodeType = pgEnum("node_type", ["ROLE", "SKILL", "DOMAIN"]);
export const nodeStatus = pgEnum("node_status", ["NEW", "VERIFIED", "HIDDEN"]);
export const nodeKind = pgEnum("node_kind", ["TECH", "CONCEPT", "SOFT"]);

export type NodeType = (typeof nodeType.enumValues)[number];
export type NodeKind = (typeof nodeKind.enumValues)[number];

export const nodes = pgTable(
  "nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: nodeType("type").notNull(),
    canonicalName: text("canonical_name").notNull(),
    // URL-facing stable id: minted once from canonical_name, immutable on rename.
    // Nullable only during the backfill window (db:seed:node-slugs fills it).
    slug: text("slug"),
    status: nodeStatus("status").notNull().default("NEW"),
    // What kind of thing this node is, orthogonal to `status` (visibility).
    // NULL = not classified yet = a grey tile on the taxonomy map.
    kind: nodeKind("kind"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("nodes_type_canonical_name_key").on(t.type, t.canonicalName),
    unique("nodes_type_slug_key").on(t.type, t.slug),
    index("nodes_status_type_idx").on(t.status, t.type),
  ],
);

export type Node = typeof nodes.$inferSelect;
export type NewNode = typeof nodes.$inferInsert;
