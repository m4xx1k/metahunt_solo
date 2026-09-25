import { sql, type SQL } from "drizzle-orm";

import type { Executor } from "../loader/repositories/executor";

/**
 * Recompute every denormalized fact about one position from its members.
 *
 * This is deliberately the only writer of unique_vacancies rollups. Keeping
 * it here prevents the loader and dedup sweep from silently growing different
 * meanings for the same columns again.
 */
export async function repairUniqueVacancy(groupId: string, executor: Executor): Promise<void> {
  await repairUniqueVacancies([groupId], executor);
}

export async function repairUniqueVacancies(
  groupIds: readonly string[],
  executor: Executor,
): Promise<void> {
  if (groupIds.length === 0) return;
  const ids = uuidArray(groupIds);

  await executor.execute(sql`
    DELETE FROM unique_vacancies u
    WHERE u.id = ANY(${ids})
      AND NOT EXISTS (
        SELECT 1 FROM vacancies v WHERE v.unique_vacancy_id = u.id
      )
  `);

  // centroid_embedding is no longer read by dedup; it is kept current only so
  // a code rollback to the centroid resolver still works.
  await executor.execute(sql`
    UPDATE unique_vacancies u
    SET
      canonical_vacancy_id = CASE
        WHEN EXISTS (
          SELECT 1
          FROM vacancies member
          WHERE member.unique_vacancy_id = u.id
            AND member.id = u.canonical_vacancy_id
        ) THEN u.canonical_vacancy_id
        ELSE members.representative_vacancy_id
      END,
      representative_vacancy_id = members.representative_vacancy_id,
      centroid_embedding = members.centroid_embedding,
      source_count = members.source_count,
      vacancy_count = members.vacancy_count,
      first_seen_at = members.first_seen_at,
      last_seen_at = members.last_seen_at,
      first_loaded_at = members.first_loaded_at,
      updated_at = now()
    FROM (
      SELECT
        v.unique_vacancy_id AS group_id,
        (array_agg(v.id ORDER BY COALESCE(v.published_at, v.loaded_at) DESC, v.id))[1]
          AS representative_vacancy_id,
        AVG(v.embedding) AS centroid_embedding,
        COUNT(DISTINCT v.source_id)::int AS source_count,
        COUNT(*)::int AS vacancy_count,
        COALESCE(MIN(v.published_at), MIN(v.loaded_at)) AS first_seen_at,
        COALESCE(MAX(v.published_at), MAX(v.loaded_at)) AS last_seen_at,
        MIN(v.loaded_at) AS first_loaded_at
      FROM vacancies v
      WHERE v.unique_vacancy_id = ANY(${ids})
      GROUP BY v.unique_vacancy_id
    ) members
    WHERE u.id = members.group_id
  `);
}

/** One bound `uuid[]` parameter, so a full-corpus id list never hits the bind-parameter limit. */
export function uuidArray(ids: readonly string[]): SQL {
  return sql`${`{${ids.join(",")}}`}::uuid[]`;
}
