import { pgTable, uuid, text, timestamp, jsonb, unique, index } from "drizzle-orm/pg-core";

import { rssIngests } from "./rss-ingests";
import { sources } from "./sources";

export const rssRecords = pgTable(
  "rss_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    rssIngestId: uuid("rss_ingest_id")
      .notNull()
      .references(() => rssIngests.id),
    externalId: text("external_id").notNull(),
    hash: text("hash").notNull(),
    // Stable identity of the normalized title + description. This intentionally
    // differs from `hash`, which identifies a source observation and includes
    // source-specific changes such as publication time and apply URL.
    contentFingerprint: text("content_fingerprint"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    link: text("link"),
    category: text("category"),
    extractedData: jsonb("extracted_data"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.sourceId, t.hash),
    index("rss_records_source_id_idx").on(t.sourceId),
    index("rss_records_rss_ingest_id_idx").on(t.rssIngestId),
    index("rss_records_extracted_at_idx").on(t.extractedAt),
    index("rss_records_content_fingerprint_idx").on(t.contentFingerprint),
    index("rss_records_source_external_idx").on(t.sourceId, t.externalId),
  ],
);

export type RssRecord = typeof rssRecords.$inferSelect;
export type NewRssRecord = typeof rssRecords.$inferInsert;
