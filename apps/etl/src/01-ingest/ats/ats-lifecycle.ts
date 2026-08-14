import { sql } from "drizzle-orm";

import type { DrizzleDB } from "@metahunt/database";

// Complete ATS boards have a lifecycle signal that RSS cannot provide. A
// missing posting is only closed after a successful, non-empty snapshot: a
// 404, schema drift, timeout, or suspicious empty response must never mass
// close a company's jobs.
export async function reconcileAtsBoardSnapshot(
  db: DrizzleDB,
  sourceId: string,
  snapshotExternalIds: Iterable<string>,
): Promise<{ closed: number; reopened: number; skippedEmptySnapshot: boolean }> {
  const ids = [...new Set(snapshotExternalIds)].filter(Boolean);
  if (ids.length === 0) {
    return { closed: 0, reopened: 0, skippedEmptySnapshot: true };
  }

  const idList = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );

  const reopenedResult = await db.execute<Record<string, unknown>>(sql`
    update vacancies
    set closed_at = null, updated_at = now()
    where source_id = ${sourceId}
      and closed_at is not null
      and external_id in (${idList})
    returning id
  `);

  const closedResult = await db.execute<Record<string, unknown>>(sql`
    update vacancies
    set closed_at = now(), updated_at = now()
    where source_id = ${sourceId}
      and closed_at is null
      and external_id not in (${idList})
    returning id
  `);

  return {
    reopened: rowsOf(reopenedResult).length,
    closed: rowsOf(closedResult).length,
    skippedEmptySnapshot: false,
  };
}

function rowsOf(result: unknown): unknown[] {
  return Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
}
