import { pgTable, uuid, text, timestamp, primaryKey, index } from "drizzle-orm/pg-core";

import { nodes, nodeType } from "./nodes";

// Retired URL-facing slugs, so a merged-away node's indexed /role/<slug> can 308
// to its target instead of 404ing, and a saved ?roles=<old-slug> filter keeps
// resolving. `node_aliases` cannot serve this: it stores normalized *names*
// (punctuation stripped), while a slug is the hyphenated URL form.
export const nodeSlugAliases = pgTable(
  "node_slug_aliases",
  {
    slug: text("slug").notNull(),
    type: nodeType("type").notNull(),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "node_slug_aliases_pkey", columns: [t.slug, t.type] }),
    index("node_slug_aliases_node_id_idx").on(t.nodeId),
  ],
);

export type NodeSlugAlias = typeof nodeSlugAliases.$inferSelect;
export type NewNodeSlugAlias = typeof nodeSlugAliases.$inferInsert;
