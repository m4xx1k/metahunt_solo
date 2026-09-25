import { sql, type SQL } from "drizzle-orm";

import type { Executor } from "../loader/repositories/executor";

import {
  LINK_WINDOW_DAYS,
  shingles,
  titleKey,
  titleLevels,
  type PostingFacts,
} from "./match-rules";
import { repairUniqueVacancies, uuidArray } from "./unique-vacancy-rollup";

export const ANN_TOP_N = 20;
const ANN_EF_SEARCH = 100;
const ANN_BATCH = 200;

export interface PostingRow {
  facts: PostingFacts;
  groupId: string;
  /** Changes whenever the source content or its embedding changes. */
  version: string;
  hasEmbedding: boolean;
  embedding: Float32Array | null;
  loadedAt: number;
  deduplicatedAt: string | null;
  dedupReason: unknown;
}

/** One vacancy's place in a partition — the unit `writePartition` and the plan files share. */
export interface PartitionEntry {
  vacancyId: string;
  groupId: string;
  version: string;
  dedupReason: unknown;
  deduplicatedAt: string | null;
}

export class StalePartitionError extends Error {}

const VERSION_SQL = sql`(v.last_rss_record_id::text || '|' || COALESCE(v.embedding_source_hash, '') || '|' || COALESCE(v.embedding_model, ''))`;

export async function loadPostings(
  db: Executor,
  ids: readonly string[] | "all",
  opts: { embeddings: boolean },
): Promise<PostingRow[]> {
  if (ids !== "all" && ids.length === 0) return [];
  const where = ids === "all" ? sql`true` : sql`v.id = ANY(${uuidArray(ids)})`;
  const embedding = opts.embeddings ? sql`v.embedding::text` : sql`NULL::text`;
  const res = await db.execute<{
    id: string;
    source_id: string;
    source_code: string;
    company_id: string | null;
    company_name: string | null;
    title: string;
    seniority: string | null;
    role_node_id: string | null;
    published_at: Date | string;
    loaded_at: Date | string;
    fingerprint: string | null;
    description: string | null;
    group_id: string;
    version: string;
    has_embedding: boolean;
    embedding: string | null;
    deduplicated_at: Date | string | null;
    dedup_reason: unknown;
  }>(sql`
    SELECT
      v.id,
      v.source_id,
      s.code AS source_code,
      v.company_id,
      c.name AS company_name,
      v.title,
      v.seniority::text AS seniority,
      v.role_node_id,
      COALESCE(v.published_at, v.loaded_at) AS published_at,
      v.loaded_at,
      r.content_fingerprint AS fingerprint,
      v.description,
      v.unique_vacancy_id AS group_id,
      ${VERSION_SQL} AS version,
      v.embedding IS NOT NULL AS has_embedding,
      ${embedding} AS embedding,
      v.deduplicated_at,
      v.dedup_reason
    FROM vacancies v
    JOIN sources s ON s.id = v.source_id
    JOIN rss_records r ON r.id = v.last_rss_record_id
    LEFT JOIN companies c ON c.id = v.company_id
    WHERE ${where}
  `);
  return res.rows.map((r) => {
    const titleOpts = { sourceCode: r.source_code, companyName: r.company_name };
    return {
      facts: {
        id: r.id,
        sourceId: r.source_id,
        companyId: r.company_id,
        title: r.title,
        titleKey: titleKey(r.title, titleOpts),
        titleLevels: titleLevels(r.title, titleOpts),
        seniority: r.seniority,
        roleNodeId: r.role_node_id,
        publishedAt: toDate(r.published_at).getTime(),
        fingerprint: r.fingerprint,
        shingles: shingles(r.description),
      },
      groupId: r.group_id,
      version: r.version,
      hasEmbedding: r.has_embedding,
      embedding: r.embedding === null ? null : parseVector(r.embedding),
      loadedAt: toDate(r.loaded_at).getTime(),
      deduplicatedAt: r.deduplicated_at === null ? null : toDate(r.deduplicated_at).toISOString(),
      dedupReason: r.dedup_reason,
    };
  });
}

/**
 * ANN top-N inside the link window, per query vacancy. Filter-light on
 * purpose: vetoes decide, SQL only retrieves. Iterative scan keeps the date
 * post-filter from starving the top-N.
 */
export async function findNeighbours(
  db: Executor,
  ids: readonly string[],
  onBatch?: (done: number) => void,
): Promise<Array<{ a: string; b: string; cosine: number }>> {
  const out: Array<{ a: string; b: string; cosine: number }> = [];
  for (let i = 0; i < ids.length; i += ANN_BATCH) {
    const batch = ids.slice(i, i + ANN_BATCH);
    const rows = await inTransaction(db, async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL hnsw.ef_search = ${ANN_EF_SEARCH}`));
      await tx.execute(sql`SET LOCAL hnsw.iterative_scan = relaxed_order`);
      // The date predicate is misestimated (~100 rows), so the planner picks an
      // exact seq scan: 100 ms per query instead of 3 ms through HNSW.
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      const res = await tx.execute<{ a: string; b: string; cosine: string }>(sql`
        SELECT q.id AS a, n.id AS b, n.cosine::text AS cosine
        FROM vacancies q
        CROSS JOIN LATERAL (
          SELECT c.id, 1 - (c.embedding <=> q.embedding) AS cosine
          FROM vacancies c
          WHERE c.id <> q.id
            AND c.embedding IS NOT NULL
            AND COALESCE(c.published_at, c.loaded_at)
              BETWEEN COALESCE(q.published_at, q.loaded_at) - make_interval(days => ${LINK_WINDOW_DAYS})
                  AND COALESCE(q.published_at, q.loaded_at) + make_interval(days => ${LINK_WINDOW_DAYS})
          ORDER BY c.embedding <=> q.embedding
          LIMIT ${ANN_TOP_N}
        ) n
        WHERE q.id = ANY(${uuidArray(batch)})
          AND q.embedding IS NOT NULL
      `);
      return res.rows;
    });
    for (const r of rows) out.push({ a: r.a, b: r.b, cosine: Number(r.cosine) });
    onBatch?.(Math.min(i + ANN_BATCH, ids.length));
  }
  return out;
}

export async function findSameFingerprint(db: Executor, vacancyId: string): Promise<string[]> {
  const res = await db.execute<{ id: string }>(sql`
    SELECT other.id
    FROM vacancies v
    JOIN rss_records r ON r.id = v.last_rss_record_id
    JOIN rss_records other_r ON other_r.content_fingerprint = r.content_fingerprint
    JOIN vacancies other ON other.last_rss_record_id = other_r.id
    WHERE v.id = ${vacancyId}
      AND other.id <> v.id
  `);
  return res.rows.map((r) => r.id);
}

export async function findGroupMembers(
  db: Executor,
  vacancyIds: readonly string[],
): Promise<string[]> {
  if (vacancyIds.length === 0) return [];
  const res = await db.execute<{ id: string }>(sql`
    SELECT member.id
    FROM vacancies member
    WHERE member.unique_vacancy_id IN (
      SELECT v.unique_vacancy_id FROM vacancies v WHERE v.id = ANY(${uuidArray(vacancyIds)})
    )
  `);
  return res.rows.map((r) => r.id);
}

export async function loadOverrides(
  db: Executor,
  ids: readonly string[] | "all",
): Promise<Array<[string, string]>> {
  const where: SQL =
    ids === "all"
      ? sql`true`
      : sql`(vacancy_a = ANY(${uuidArray(ids)}) OR vacancy_b = ANY(${uuidArray(ids)}))`;
  const res = await db.execute<{ vacancy_a: string; vacancy_b: string }>(sql`
    SELECT vacancy_a, vacancy_b FROM dedup_overrides WHERE ${where}
  `);
  return res.rows.map((r) => [r.vacancy_a, r.vacancy_b]);
}

export async function insertDifferentOverrides(
  db: Executor,
  vacancyId: string,
  others: readonly string[],
  createdBy: string | null,
): Promise<void> {
  if (others.length === 0) return;
  await db.execute(sql`
    INSERT INTO dedup_overrides (vacancy_a, vacancy_b, verdict, created_by)
    SELECT LEAST(${vacancyId}::uuid, o), GREATEST(${vacancyId}::uuid, o), 'different', ${createdBy}::uuid
    FROM unnest(${uuidArray(others)}) AS o
    WHERE o <> ${vacancyId}::uuid
    ON CONFLICT DO NOTHING
  `);
}

/**
 * Writes a partition of `entries` atomically. Every entry's version must still
 * match, and no vacancy outside `entries` may share a group with one inside it;
 * otherwise nothing is written and StalePartitionError is thrown.
 * Lock order is vacancy → group, the same as the loader.
 */
export async function writePartition(
  tx: Executor,
  entries: readonly PartitionEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  const ids = entries.map((e) => e.vacancyId);

  const locked = await tx.execute<{ id: string; group_id: string; version: string }>(sql`
    SELECT v.id, v.unique_vacancy_id AS group_id, ${VERSION_SQL} AS version
    FROM vacancies v
    WHERE v.id = ANY(${uuidArray(ids)})
    ORDER BY v.id
    FOR UPDATE
  `);
  const current = new Map(locked.rows.map((r) => [r.id, r]));
  for (const e of entries) {
    const row = current.get(e.vacancyId);
    if (!row) throw new StalePartitionError(`vacancy ${e.vacancyId} no longer exists`);
    if (row.version !== e.version) {
      throw new StalePartitionError(`vacancy ${e.vacancyId} changed since the partition was built`);
    }
  }

  const oldGroups = [...new Set(locked.rows.map((r) => r.group_id))];
  const outsiders = await tx.execute<{ id: string }>(sql`
    SELECT id FROM vacancies
    WHERE unique_vacancy_id = ANY(${uuidArray(oldGroups)})
      AND NOT (id = ANY(${uuidArray(ids)}))
    LIMIT 1
  `);
  if (outsiders.rows.length > 0) {
    throw new StalePartitionError(`vacancy ${outsiders.rows[0].id} joined an affected group`);
  }

  const allGroups = [...new Set([...oldGroups, ...entries.map((e) => e.groupId)])].sort();
  await tx.execute(sql`
    SELECT id FROM unique_vacancies WHERE id = ANY(${uuidArray(allGroups)}) ORDER BY id FOR UPDATE
  `);

  const payload = JSON.stringify(
    entries.map((e) => ({
      vacancy_id: e.vacancyId,
      group_id: e.groupId,
      dedup_reason: e.dedupReason ?? null,
      deduplicated_at: e.deduplicatedAt,
    })),
  );
  await tx.execute(sql`
    INSERT INTO unique_vacancies (id, canonical_vacancy_id, first_seen_at, last_seen_at)
    SELECT DISTINCT ON (x.group_id) x.group_id, x.vacancy_id, now(), now()
    FROM jsonb_to_recordset(${payload}::jsonb) AS x(vacancy_id uuid, group_id uuid)
    WHERE NOT EXISTS (SELECT 1 FROM unique_vacancies u WHERE u.id = x.group_id)
    ORDER BY x.group_id, x.vacancy_id
  `);
  await tx.execute(sql`
    UPDATE vacancies v
    SET unique_vacancy_id = x.group_id,
        dedup_reason = x.dedup_reason,
        deduplicated_at = x.deduplicated_at
    FROM jsonb_to_recordset(${payload}::jsonb)
      AS x(vacancy_id uuid, group_id uuid, dedup_reason jsonb, deduplicated_at timestamptz)
    WHERE v.id = x.vacancy_id
  `);
  await repairUniqueVacancies(allGroups, tx);
}

async function inTransaction<T>(db: Executor, fn: (tx: Executor) => Promise<T>): Promise<T> {
  return (db as { transaction: (cb: (tx: Executor) => Promise<T>) => Promise<T> }).transaction(fn);
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function parseVector(text: string): Float32Array {
  const body = text.trim().slice(1, -1);
  return Float32Array.from(body.split(","), Number);
}
