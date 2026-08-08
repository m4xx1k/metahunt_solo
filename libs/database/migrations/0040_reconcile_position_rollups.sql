-- Custom SQL migration file, put your code below! --
-- Repair the pre-1b rollup drift. Before the shared rollup writer, the loader
-- and dedup sweep used different member sets and date definitions; 863 prod
-- groups had a stale `last_seen_at`. Recompute every denormalized group fact
-- once from all current members, using the same definition as 1b.
WITH rollups AS (
  SELECT
    v.unique_vacancy_id AS id,
    (array_agg(v.id ORDER BY COALESCE(v.published_at, v.loaded_at) DESC, v.id))[1]
      AS representative_vacancy_id,
    AVG(v.embedding) AS centroid_embedding,
    COUNT(DISTINCT v.source_id)::int AS source_count,
    COUNT(*)::int AS vacancy_count,
    COALESCE(MIN(v.published_at), MIN(v.loaded_at)) AS first_seen_at,
    COALESCE(MAX(v.published_at), MAX(v.loaded_at)) AS last_seen_at,
    MIN(v.loaded_at) AS first_loaded_at
  FROM vacancies v
  GROUP BY v.unique_vacancy_id
)
UPDATE unique_vacancies u
SET
  canonical_vacancy_id = CASE
    WHEN EXISTS (
      SELECT 1
      FROM vacancies member
      WHERE member.unique_vacancy_id = u.id
        AND member.id = u.canonical_vacancy_id
    ) THEN u.canonical_vacancy_id
    ELSE r.representative_vacancy_id
  END,
  representative_vacancy_id = r.representative_vacancy_id,
  centroid_embedding = r.centroid_embedding,
  source_count = r.source_count,
  vacancy_count = r.vacancy_count,
  first_seen_at = r.first_seen_at,
  last_seen_at = r.last_seen_at,
  first_loaded_at = r.first_loaded_at,
  updated_at = now()
FROM rollups r
WHERE u.id = r.id
  AND (
    u.representative_vacancy_id IS DISTINCT FROM r.representative_vacancy_id
    OR u.centroid_embedding IS DISTINCT FROM r.centroid_embedding
    OR u.source_count IS DISTINCT FROM r.source_count
    OR u.vacancy_count IS DISTINCT FROM r.vacancy_count
    OR u.first_seen_at IS DISTINCT FROM r.first_seen_at
    OR u.last_seen_at IS DISTINCT FROM r.last_seen_at
    OR u.first_loaded_at IS DISTINCT FROM r.first_loaded_at
    OR NOT EXISTS (
      SELECT 1
      FROM vacancies canonical
      WHERE canonical.unique_vacancy_id = u.id
        AND canonical.id = u.canonical_vacancy_id
    )
  );
