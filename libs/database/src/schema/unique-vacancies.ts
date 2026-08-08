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

    // MISNOMER, rename pending (see the tracker): both hold the SOURCE's
    // publication claim (MIN/MAX of `published_at`), not when we saw anything.
    // 24% of postings get `published_at` bumped on refresh, so these track
    // liveness; `firstLoadedAt` below is the bump-proof first-appearance.
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),

    // MIN(loaded_at) over members — the only time axis a cohort or trend may
    // use. Nullable only during the backfill window.
    firstLoadedAt: timestamp("first_loaded_at", { withTimezone: true }),

    // The member shown as the group's card. Denormalized so counting queries
    // never have to re-derive the winner with a window function.
    representativeVacancyId: uuid("representative_vacancy_id").references(
      (): AnyPgColumn => vacancies.id,
    ),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("unique_vacancies_canonical_idx").on(t.canonicalVacancyId),
    index("unique_vacancies_source_count_idx").on(t.sourceCount.desc()),
    // Serves both the freshness predicate (ADR-0013) and date sorting.
    index("unique_vacancies_last_seen_idx").on(t.lastSeenAt.desc()),
  ],
);

export type UniqueVacancy = typeof uniqueVacancies.$inferSelect;
export type NewUniqueVacancy = typeof uniqueVacancies.$inferInsert;
