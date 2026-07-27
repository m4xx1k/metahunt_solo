import { pgTable, pgEnum, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const sourceKind = pgEnum("source_kind", ["rss", "ats"]);

// Mirrors ATS_TYPES in apps/etl/src/01-ingest/ats/ats.contract.ts.
export const atsType = pgEnum("ats_type", ["ashby", "greenhouse", "lever", "hurma"]);

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  displayName: text("display_name").notNull(),
  baseUrl: text("base_url").notNull(),
  rssUrl: text("rss_url"),

  // One row per board. `code` stays the human key: `ats:<atsType>:<slug>`.
  kind: sourceKind("kind").notNull().default("rss"),
  atsType: atsType("ats_type"),
  atsSlug: text("ats_slug"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
