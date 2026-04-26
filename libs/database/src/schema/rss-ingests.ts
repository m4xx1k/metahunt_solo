import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { sources } from './sources';

export const rssIngests = pgTable(
  'rss_ingests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id),
    workflowRunId: text('workflow_run_id'),
    triggeredBy: text('triggered_by').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    payloadStorageKey: text('payload_storage_key'),
    status: text('status').notNull().default('running'),
    errorMessage: text('error_message'),
  },
  (t) => [
    index('rss_ingests_source_id_idx').on(t.sourceId),
    unique('rss_ingests_workflow_run_id_key').on(t.workflowRunId),
  ],
);

export type RssIngest = typeof rssIngests.$inferSelect;
export type NewRssIngest = typeof rssIngests.$inferInsert;
