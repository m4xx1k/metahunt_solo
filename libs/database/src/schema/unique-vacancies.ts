import {
  pgTable,
  uuid,
  integer,
  timestamp,
  vector,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { vacancies } from "./vacancies";

// A UniqueVacancy is the canonical grouping of cross-source duplicates.
// One row in `vacancies` belongs to at most one UniqueVacancy via
// `vacancies.unique_vacancy_id`; the back-ref `canonical_vacancy_id` here
// names which member is shown as the "main" representation.
//
// Aggregates (mergedSkills, salary range, status) are intentionally NOT
// stored — they can be computed on read in MVP and only get denormalized
// once the feed swap to UniqueVacancy actually needs them.
export const uniqueVacancies = pgTable(
  "unique_vacancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canonicalVacancyId: uuid("canonical_vacancy_id")
      .notNull()
      .references((): AnyPgColumn => vacancies.id),

    // Mean of member embeddings. Used as anchor point when resolving new
    // vacancies; recomputed on every merge/unmerge.
    centroidEmbedding: vector("centroid_embedding", { dimensions: 1536 }),

    // Denormalized counters — kept in sync inside resolve transactions.
    // sourceCount = COUNT(DISTINCT source_id) of members; the >=2 filter
    // for the cross-source dashboard view runs against this column.
    sourceCount: integer("source_count").notNull().default(1),
    vacancyCount: integer("vacancy_count").notNull().default(1),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("unique_vacancies_canonical_idx").on(t.canonicalVacancyId),
    index("unique_vacancies_source_count_idx").on(t.sourceCount.desc()),
  ],
);

export type UniqueVacancy = typeof uniqueVacancies.$inferSelect;
export type NewUniqueVacancy = typeof uniqueVacancies.$inferInsert;
