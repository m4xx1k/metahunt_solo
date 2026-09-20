ALTER TABLE "vacancy_nodes" ADD COLUMN "requirement_group" smallint;--> statement-breakpoint
-- CREATE OR REPLACE, not DROP + CREATE as drizzle-kit generates: node_stats,
-- node_skill_cooc and the track views depend on this one.
CREATE OR REPLACE VIEW "public"."position_nodes" AS (
    SELECT
      uv.id AS position_id,
      vn.node_id,
      vn.is_required,
      vn.requirement_group
    FROM unique_vacancies uv
    JOIN vacancy_nodes vn ON vn.vacancy_id = uv.canonical_vacancy_id
  );
