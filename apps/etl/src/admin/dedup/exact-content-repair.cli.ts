/*
 * Bounded historical repair. It never calls an LLM or embedding provider and
 * only joins groups proven equal by normalized content within the 45-day
 * window. `--dry-run` is read-only; `--apply` writes a reversible manifest.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { Pool, type PoolClient } from "pg";

import { contentFingerprint } from "../../02-enrich/dedup/content-fingerprint";

const WINDOW_MS = 45 * 86_400_000;
type Row = {
  id: string;
  groupId: string;
  companyId: string | null;
  title: string;
  description: string | null;
  publishedAt: Date;
};
type Plan = {
  fingerprint: string;
  targetGroupId: string;
  sourceGroupIds: string[];
  recordIds: string[];
  conflicts: string[];
};
type Manifest = {
  runId: string;
  createdAt: string;
  postingCount: number;
  plans: Plan[];
  groups: unknown[];
  memberships: Array<{ id: string; groupId: string }>;
};

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const rollback = value("--rollback");
  const dryRun = process.argv.includes("--dry-run");
  if (Number(apply) + Number(Boolean(rollback)) + Number(dryRun) !== 1) {
    throw new Error(
      "usage: exact-content-repair --dry-run | --apply [--manifest path] | --rollback path",
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    if (rollback) await rollbackManifest(pool, rollback);
    else await planOrApply(pool, apply);
  } finally {
    await pool.end();
  }
}

async function planOrApply(pool: Pool, apply: boolean): Promise<void> {
  const rows = (
    await pool.query<Row>(`
    SELECT v.id, v.unique_vacancy_id AS "groupId", v.company_id AS "companyId",
           r.title, r.description, v.published_at AS "publishedAt"
    FROM vacancies v JOIN rss_records r ON r.id = v.last_rss_record_id
    WHERE v.published_at IS NOT NULL
  `)
  ).rows;
  const discovered = makePlans(rows);
  const plans = discovered.filter((plan) => plan.conflicts.length === 0);
  const conflicts = discovered.flatMap((p) => p.conflicts);
  // Deliberately prints only UUIDs/fingerprints/group ids; never DATABASE_URL.
  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        eligible: plans.length,
        conflicts: conflicts.length,
        plans,
      },
      null,
      2,
    ),
  );
  if (!apply) return;

  const runId = randomUUID();
  const manifestPath = resolve(
    value("--manifest") ?? `.scratch/exact-content-repair-${runId}.json`,
  );
  const affectedGroups = [...new Set(plans.flatMap((p) => [p.targetGroupId, ...p.sourceGroupIds]))];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const postingCount = Number(
      (await client.query<{ count: string }>("SELECT count(*)::text AS count FROM vacancies"))
        .rows[0].count,
    );
    const groups = affectedGroups.length
      ? (
          await client.query<{ row: unknown }>(
            "SELECT row_to_json(u) AS row FROM unique_vacancies u WHERE u.id = ANY($1::uuid[])",
            [affectedGroups],
          )
        ).rows.map((r) => r.row)
      : ([] as unknown[]);
    const memberships = affectedGroups.length
      ? (
          await client.query<{ id: string; groupId: string }>(
            'SELECT id, unique_vacancy_id AS "groupId" FROM vacancies WHERE unique_vacancy_id = ANY($1::uuid[])',
            [affectedGroups],
          )
        ).rows
      : [];
    const manifest: Manifest = {
      runId,
      createdAt: new Date().toISOString(),
      postingCount,
      plans,
      conflictVacancyIds: conflicts,
      groups,
      memberships,
    };
    // Persist rollback state before mutation. It contains no connection data.
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    for (const plan of plans) await applyPlan(client, plan, rows);
    const after = Number(
      (await client.query<{ count: string }>("SELECT count(*)::text AS count FROM vacancies"))
        .rows[0].count,
    );
    if (after !== postingCount)
      throw new Error(`posting conservation failed: ${postingCount} -> ${after}`);
    const bad = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM unique_vacancies u
      JOIN LATERAL (SELECT count(*) AS n, count(DISTINCT source_id) AS s FROM vacancies v WHERE v.unique_vacancy_id=u.id) x ON true
      WHERE u.vacancy_count <> x.n OR u.source_count <> x.s
    `);
    if (Number(bad.rows[0].count) !== 0) throw new Error("group counter conservation failed");
    await client.query("COMMIT");
    console.log(
      JSON.stringify({ runId, manifestPath, applied: plans.length, postingCount }, null, 2),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function makePlans(rows: Row[]): Plan[] {
  const byFingerprint = new Map<string, Row[]>();
  for (const row of rows) {
    const fingerprint = contentFingerprint(row.title, row.description);
    const group = byFingerprint.get(fingerprint) ?? [];
    group.push(row);
    byFingerprint.set(fingerprint, group);
  }
  const plans: Plan[] = [];
  for (const [fingerprint, members] of byFingerprint) {
    if (members.length < 2) continue;
    const groups = [...new Set(members.map((m) => m.groupId))];
    if (groups.length < 2) continue;
    const min = Math.min(...members.map((m) => m.publishedAt.getTime()));
    const max = Math.max(...members.map((m) => m.publishedAt.getTime()));
    if (max - min > WINDOW_MS) continue;
    const companies = [
      ...new Set(members.map((m) => m.companyId).filter((id): id is string => id !== null)),
    ];
    const conflicts = companies.length > 1 ? members.map((m) => m.id) : [];
    if (conflicts.length) {
      plans.push({
        fingerprint,
        targetGroupId: groups.sort()[0],
        sourceGroupIds: groups.slice(1),
        recordIds: members.map((m) => m.id),
        conflicts,
      });
      continue;
    }
    const sortedGroups = groups.sort();
    plans.push({
      fingerprint,
      targetGroupId: sortedGroups[0],
      sourceGroupIds: sortedGroups.slice(1),
      recordIds: members.map((m) => m.id),
      conflicts: [],
    });
  }
  return plans;
}

async function applyPlan(client: PoolClient, plan: Plan, all: Row[]): Promise<void> {
  const fpById = new Map(
    all
      .filter((row) => plan.recordIds.includes(row.id))
      .map((row) => [row.id, contentFingerprint(row.title, row.description)]),
  );
  for (const [id, fingerprint] of fpById)
    await client.query(
      "UPDATE rss_records SET content_fingerprint=$1 WHERE id=(SELECT last_rss_record_id FROM vacancies WHERE id=$2::uuid)",
      [fingerprint, id],
    );
  if (!plan.sourceGroupIds.length) return;
  await client.query(
    "UPDATE vacancies SET unique_vacancy_id=$1::uuid, dedup_reason=jsonb_build_object('method','exact_content','similarity',1,'matchedAgainstVacancyId',id::text,'confidence','gold','decidedAt',now()::text) WHERE unique_vacancy_id = ANY($2::uuid[])",
    [plan.targetGroupId, plan.sourceGroupIds],
  );
  await repairRollup(client, plan.targetGroupId);
  await client.query("DELETE FROM unique_vacancies WHERE id = ANY($1::uuid[])", [
    plan.sourceGroupIds,
  ]);
}

async function repairRollup(client: PoolClient, groupId: string): Promise<void> {
  await client.query(
    `
    UPDATE unique_vacancies u SET canonical_vacancy_id=x.representative, representative_vacancy_id=x.representative,
      centroid_embedding=x.centroid, source_count=x.sources, vacancy_count=x.count, first_seen_at=x.first_seen,
      last_seen_at=x.last_seen, first_loaded_at=x.first_loaded, updated_at=now()
    FROM (SELECT (array_agg(id ORDER BY coalesce(published_at,loaded_at) DESC,id))[1] representative,
      avg(embedding) centroid, count(distinct source_id)::int sources, count(*)::int count,
      coalesce(min(published_at),min(loaded_at)) first_seen, coalesce(max(published_at),max(loaded_at)) last_seen, min(loaded_at) first_loaded
      FROM vacancies WHERE unique_vacancy_id=$1::uuid) x WHERE u.id=$1::uuid`,
    [groupId],
  );
}

async function rollbackManifest(pool: Pool, path: string): Promise<void> {
  const manifest = JSON.parse(await readFile(resolve(path), "utf8")) as Manifest;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const group of manifest.groups)
      await client.query(
        "INSERT INTO unique_vacancies SELECT * FROM json_populate_record(NULL::unique_vacancies, $1::json) ON CONFLICT (id) DO NOTHING",
        [JSON.stringify(group)],
      );
    for (const row of manifest.memberships)
      await client.query("UPDATE vacancies SET unique_vacancy_id=$1::uuid WHERE id=$2::uuid", [
        row.groupId,
        row.id,
      ]);
    for (const group of manifest.groups as Array<{ id: string }>)
      await repairRollup(client, group.id);
    const count = Number(
      (await client.query<{ count: string }>("SELECT count(*)::text AS count FROM vacancies"))
        .rows[0].count,
    );
    if (count !== manifest.postingCount)
      throw new Error("posting conservation failed during rollback");
    await client.query("COMMIT");
    console.log(JSON.stringify({ rolledBackRunId: manifest.runId, postingCount: count }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function value(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
