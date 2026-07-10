import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  unique,
  index,
  vector,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { companies } from "./companies";
import { nodes } from "./nodes";
import { rssRecords } from "./rss-records";
import { sources } from "./sources";
import { uniqueVacancies } from "./unique-vacancies";

// Match BAML enums in apps/etl/baml_src/extract-vacancy.baml
export const seniority = pgEnum("seniority", [
  "INTERN",
  "JUNIOR",
  "MIDDLE",
  "SENIOR",
  "LEAD",
  "PRINCIPAL",
  "C_LEVEL",
]);

export const workFormat = pgEnum("work_format", ["REMOTE", "OFFICE", "HYBRID"]);

export const employmentType = pgEnum("employment_type", [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "FREELANCE",
  "INTERNSHIP",
]);

export const englishLevel = pgEnum("english_level", [
  "BEGINNER",
  "INTERMEDIATE",
  "UPPER_INTERMEDIATE",
  "ADVANCED",
  "NATIVE",
]);

export const currency = pgEnum("currency", ["USD", "EUR", "UAH"]);

export const engagementType = pgEnum("engagement_type", [
  "PRODUCT",
  "OUTSOURCE",
  "OUTSTAFF",
  "STARTUP",
  "AGENCY",
]);

export const vacancies = pgTable(
  "vacancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    externalId: text("external_id").notNull(),
    lastRssRecordId: uuid("last_rss_record_id")
      .notNull()
      .references(() => rssRecords.id),

    title: text("title").notNull(),
    description: text("description"),

    companyId: uuid("company_id").references(() => companies.id),
    roleNodeId: uuid("role_node_id").references(() => nodes.id),
    domainNodeId: uuid("domain_node_id").references(() => nodes.id),

    seniority: seniority("seniority"),
    workFormat: workFormat("work_format"),
    employmentType: employmentType("employment_type"),
    englishLevel: englishLevel("english_level"),
    experienceYears: integer("experience_years"),

    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    currency: currency("currency"),

    engagementType: engagementType("engagement_type"),
    hasTestAssignment: boolean("has_test_assignment"),
    hasReservation: boolean("has_reservation"),

    locations: jsonb("locations"),

    // Denormalized from `rss_records.published_at` so dedup pre-filter
    // queries don't need to join on every ANN call. Backfilled by the
    // dedup migration; new loads set it via VacancyLoaderService.
    publishedAt: timestamp("published_at", { withTimezone: true }),

    // Semantic embedding of the role + description (post-LLM-sanitized).
    // Null until the dedup pipeline has processed this row.
    embedding: vector("embedding", { dimensions: 1536 }),
    embeddingModel: text("embedding_model"),
    // sha256 of the canonical text used to generate `embedding`. Re-embed
    // only when this changes — guarantees idempotency without touching
    // OpenAI on no-op updates.
    embeddingSourceHash: text("embedding_source_hash"),

    // Current group membership. Null = unresolved (not yet processed) OR
    // explicitly unlinked by operator. SET NULL on group delete so cleanup
    // doesn't cascade-delete real vacancies.
    uniqueVacancyId: uuid("unique_vacancy_id").references((): AnyPgColumn => uniqueVacancies.id, {
      onDelete: "set null",
    }),
    // Why this vacancy ended up in this group. Same shape as the
    // `DedupReason` interface in apps/etl/src/dedup/dedup.contract.ts —
    // intentionally no DB-side mapping, the JSON is served verbatim.
    // Null for canonical members and for unresolved vacancies.
    dedupReason: jsonb("dedup_reason"),

    loadedAt: timestamp("loaded_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("vacancies_source_external_key").on(t.sourceId, t.externalId),
    index("vacancies_company_id_idx").on(t.companyId),
    index("vacancies_role_node_id_idx").on(t.roleNodeId),
    index("vacancies_loaded_at_idx").on(t.loadedAt.desc()),
    index("vacancies_source_published_idx").on(t.sourceId, t.publishedAt),
    index("vacancies_unique_vacancy_id_idx").on(t.uniqueVacancyId),
    // HNSW on cosine distance — drives the second-stage ANN ranking.
    // Defaults (m=16, ef_construction=64) are pgvector's recommended
    // starting point and work well at our 3-4k row scale.
    index("vacancies_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export type Vacancy = typeof vacancies.$inferSelect;
export type NewVacancy = typeof vacancies.$inferInsert;
