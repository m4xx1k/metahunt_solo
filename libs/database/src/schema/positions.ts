import { sql } from "drizzle-orm";
import { uuid, text, timestamp, integer, boolean, jsonb, pgView } from "drizzle-orm/pg-core";

// The default market entity (MET-137/ADR-0012): exactly one row per
// `unique_vacancies.id`. A source/ATS may produce several Postings for the
// same real opportunity (a repost); every one of them collapses to one
// Position here.
//
// All descriptive/filterable facts come from the CANONICAL posting
// (`canonical_posting_id`) — title, company, role, domain, seniority, salary,
// locations, etc. `representative_posting_id` is a pointer only, for
// display/link hydration (join back into `postings` when the current card
// link or freshness stamp is needed); it must never silently replace a
// canonical fact in a filter or an aggregate.
//
// Contains ALL positions — no eligibility/VERIFIED/time-window filtering
// baked in. Consumers apply `ELIGIBLE_POSITION` (or their own rule)
// explicitly, the same way they do today over `vacancies`.
export const positions = pgView("positions", {
  positionId: uuid("position_id"),
  canonicalPostingId: uuid("canonical_posting_id"),
  representativePostingId: uuid("representative_posting_id"),

  title: text("title"),
  description: text("description"),

  companyId: uuid("company_id"),
  companyName: text("company_name"),
  companySlug: text("company_slug"),

  roleNodeId: uuid("role_node_id"),
  domainNodeId: uuid("domain_node_id"),

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

  firstObservedAt: timestamp("first_observed_at", { withTimezone: true }),
  firstSourceClaimAt: timestamp("first_source_claim_at", { withTimezone: true }),
  lastSourceActivityAt: timestamp("last_source_activity_at", { withTimezone: true }),

  postingCount: integer("posting_count"),
  sourceCount: integer("source_count"),
}).as(
  sql`
    SELECT
      uv.id AS position_id,
      uv.canonical_vacancy_id AS canonical_posting_id,
      uv.representative_vacancy_id AS representative_posting_id,

      canonical.title,
      canonical.description,

      c.id AS company_id,
      c.name AS company_name,
      c.slug AS company_slug,

      canonical.role_node_id,
      canonical.domain_node_id,

      canonical.seniority::text,
      canonical.work_format::text,
      canonical.employment_type::text,
      canonical.english_level::text,
      canonical.experience_years,
      canonical.engagement_type::text,
      canonical.has_test_assignment,
      canonical.has_reservation,

      canonical.salary_min,
      canonical.salary_max,
      canonical.currency::text,

      canonical.locations,

      uv.first_loaded_at AS first_observed_at,
      uv.first_seen_at AS first_source_claim_at,
      uv.last_seen_at AS last_source_activity_at,

      uv.vacancy_count AS posting_count,
      uv.source_count AS source_count
    FROM unique_vacancies uv
    JOIN vacancies canonical ON canonical.id = uv.canonical_vacancy_id
    LEFT JOIN companies c ON c.id = canonical.company_id
  `,
);

export type Position = typeof positions.$inferSelect;
