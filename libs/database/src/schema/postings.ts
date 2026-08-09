import { sql } from "drizzle-orm";
import { uuid, text, timestamp, integer, boolean, jsonb, pgView } from "drizzle-orm/pg-core";

// Stable, curated read facade over `vacancies` — one row per source
// observation. Not `SELECT *`: embeddings, dedup pipeline internals
// (`deduplicated_at`, `dedup_reason`, `embedding*`) and other storage-only
// columns stay out until a named consumer needs them (MET-138).
//
// `position_id` is `vacancies.unique_vacancy_id`, kept visible so a caller can
// jump straight to the position group without a second join. It is never
// null (0042 made the group mandatory), but the column stays nullable here so
// a future ATS source without dedup applied yet degrades instead of breaking
// the view.
export const postings = pgView("postings", {
  postingId: uuid("posting_id"),
  positionId: uuid("position_id"),

  externalId: text("external_id"),
  title: text("title"),
  description: text("description"),

  seniority: text("seniority"),
  workFormat: text("work_format"),
  employmentType: text("employment_type"),
  englishLevel: text("english_level"),
  experienceYears: integer("experience_years"),
  engagementType: text("engagement_type"),
  hasTestAssignment: boolean("has_test_assignment"),
  hasReservation: boolean("has_reservation"),

  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  currency: text("currency"),

  locations: jsonb("locations"),

  companyId: uuid("company_id"),
  companyName: text("company_name"),
  companySlug: text("company_slug"),

  roleNodeId: uuid("role_node_id"),
  domainNodeId: uuid("domain_node_id"),

  sourceId: uuid("source_id"),
  sourceCode: text("source_code"),
  sourceDisplayName: text("source_display_name"),

  rssRecordId: uuid("rss_record_id"),
  link: text("link"),
  publishedAt: timestamp("published_at", { withTimezone: true }),

  loadedAt: timestamp("loaded_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
}).as(
  sql`
    SELECT
      v.id AS posting_id,
      v.unique_vacancy_id AS position_id,

      v.external_id,
      v.title,
      v.description,

      v.seniority::text,
      v.work_format::text,
      v.employment_type::text,
      v.english_level::text,
      v.experience_years,
      v.engagement_type::text,
      v.has_test_assignment,
      v.has_reservation,

      v.salary_min,
      v.salary_max,
      v.currency::text,

      v.locations,

      c.id AS company_id,
      c.name AS company_name,
      c.slug AS company_slug,

      v.role_node_id,
      v.domain_node_id,

      s.id AS source_id,
      s.code AS source_code,
      s.display_name AS source_display_name,

      r.id AS rss_record_id,
      r.link,
      r.published_at,

      v.loaded_at,
      v.updated_at
    FROM vacancies v
    JOIN sources s ON s.id = v.source_id
    JOIN rss_records r ON r.id = v.last_rss_record_id
    LEFT JOIN companies c ON c.id = v.company_id
  `,
);

export type Posting = typeof postings.$inferSelect;
