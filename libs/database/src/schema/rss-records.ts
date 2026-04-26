import { pgTable, uuid, text, timestamp, jsonb, unique, index } from 'drizzle-orm/pg-core';
import { sources } from './sources';
import { rssIngests } from './rss-ingests';

export const rssRecords = pgTable('rss_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => sources.id),
  rssIngestId: uuid('rss_ingest_id').notNull().references(() => rssIngests.id),
  externalId: text('external_id'),
  hash: text('hash').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  link: text('link'),
  category: text('category'),
  extractedData: jsonb('extracted_data'),
  extractedAt: timestamp('extracted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.sourceId, t.hash),
  index('rss_records_source_id_idx').on(t.sourceId),
  index('rss_records_rss_ingest_id_idx').on(t.rssIngestId),
  index('rss_records_extracted_at_idx').on(t.extractedAt),
]);

export type RssRecord = typeof rssRecords.$inferSelect;
export type NewRssRecord = typeof rssRecords.$inferInsert;
