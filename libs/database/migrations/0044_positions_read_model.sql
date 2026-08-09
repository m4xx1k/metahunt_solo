CREATE VIEW "public"."postings" AS (
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
  );--> statement-breakpoint
CREATE VIEW "public"."positions" AS (
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
  );--> statement-breakpoint
CREATE VIEW "public"."position_nodes" AS (
    SELECT
      uv.id AS position_id,
      vn.node_id,
      vn.is_required
    FROM unique_vacancies uv
    JOIN vacancy_nodes vn ON vn.vacancy_id = uv.canonical_vacancy_id
  );