// One-shot bulk fill: walks every rss_records row with extracted_at
// set but no matching vacancies row, runs VacancyLoaderService against
// each one, and reports per-record progress + taxonomy match coverage.
//
// Run:
//   npx ts-node --project apps/etl/tsconfig.json apps/etl/scripts/fill-vacancies.ts [limit]
//
//   limit — max records to process (default: all pending)
//
// Same loader path the HTTP endpoint /loader/backfill uses; this script
// just bypasses Nest+HTTP for one-off CLI use against any DATABASE_URL.
//
// What this reports beyond the loader's basic counts:
//   - For every (type, name) mention extracted by BAML, classifies the
//     resolution outcome BEFORE the loader writes:
//       * matched-VERIFIED — alias exists and links to a curated node
//       * matched-NEW      — alias exists but links to a node previously
//                            auto-created by an earlier run / record;
//                            still awaiting moderation
//       * created-NEW      — no alias hit; resolver will insert a fresh
//                            NEW node so the mention isn't lost
//   - Aggregates per type and surfaces the top uncovered names so you
//     know what to add to libs/database/seeds/data/nodes.json next.
//
// Preconditions:
//   - migrations 0004 + 0005 + 0006 applied (vacancies/nodes/companies
//     tables exist; rss_records.external_id is NOT NULL; node_aliases
//     has a `type` column).
//   - taxonomy seed run at least once (`pnpm db:seed`), otherwise every
//     mention will report as created-NEW which is correct but uninteresting.
//   - sources.code matches an entry in the loader's extractor registry
//     (currently 'djinni', 'dou').
//
// If the silver tables aren't there yet, run `pnpm db:migrate` first.
// If the local DB has the bronze tables but an empty
// `drizzle.__drizzle_migrations` tracking table (i.e. the schema was
// created out-of-band via push, not migrate), see
// md/runbook/loader-pipeline-smoke.md for the recovery path.

import "dotenv/config";
import { Test } from "@nestjs/testing";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, and, eq } from "drizzle-orm";
import { Pool } from "pg";

import { DRIZZLE, schema } from "@metahunt/database";

import { CompanyResolverService } from "../src/loader/services/company-resolver.service";
import { NodeResolverService } from "../src/loader/services/node-resolver.service";
import { VacancyLoaderService } from "../src/loader/services/vacancy-loader.service";

import type { ExtractedVacancy } from "../src/baml_client/types";

type NodeTypeValue = "ROLE" | "SKILL" | "DOMAIN";
type Outcome = "matched-verified" | "matched-new" | "created-new";

const PROGRESS_EVERY = 10;
const TOP_UNCOVERED = 20;

type TypeStats = Record<Outcome, number>;
type CoverageStats = Record<NodeTypeValue, TypeStats>;

const emptyTypeStats = (): TypeStats => ({
  "matched-verified": 0,
  "matched-new": 0,
  "created-new": 0,
});

async function main(): Promise<void> {
  const limitArg = process.argv[2];
  const limit = limitArg ? Number(limitArg) : Number.MAX_SAFE_INTEGER;
  if (limitArg && (!Number.isInteger(limit) || limit < 1)) {
    console.error(`Invalid limit "${limitArg}" — must be a positive integer`);
    process.exit(1);
  }

  const connectionString =
    process.env.DATABASE_URL ??
    "postgres://metahunt:metahunt@localhost:54322/metahunt";
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  try {
    await assertSilverSchemaExists(db);

    const pending = await db.execute<{ id: string }>(sql`
      SELECT r.id
      FROM rss_records r
      WHERE r.extracted_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM vacancies v
          WHERE v.source_id = r.source_id
            AND v.external_id = r.external_id
        )
      ORDER BY r.created_at ASC
      LIMIT ${limit}
    `);

    const ids = pending.rows.map((r) => r.id);
    if (ids.length === 0) {
      console.log("No pending records — vacancies table already in sync.");
      return;
    }
    console.log(`Filling vacancies from ${ids.length} pending record(s)...`);

    const moduleRef = await Test.createTestingModule({
      providers: [
        CompanyResolverService,
        NodeResolverService,
        VacancyLoaderService,
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();
    const loader = moduleRef.get(VacancyLoaderService);

    const coverage: CoverageStats = {
      ROLE: emptyTypeStats(),
      SKILL: emptyTypeStats(),
      DOMAIN: emptyTypeStats(),
    };
    // key = `${type}:${normalized name}`, value = mention count
    const uncovered = new Map<string, number>();

    let succeeded = 0;
    let failed = 0;
    const startedAt = Date.now();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
        await scoreMentions(db, id, coverage, uncovered);
        await loader.loadFromRecord(id);
        succeeded++;
      } catch (err) {
        failed++;
        console.warn(
          `  [${i + 1}/${ids.length}] FAILED ${id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      if ((i + 1) % PROGRESS_EVERY === 0 || i + 1 === ids.length) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        const rate = ((i + 1) / Number(elapsed)).toFixed(1);
        console.log(
          `  [${i + 1}/${ids.length}] succeeded=${succeeded} failed=${failed} elapsed=${elapsed}s (${rate}/s)`,
        );
      }
    }

    const counts = await db.execute<{
      vacancies: string;
      companies: string;
      nodes: string;
      new_nodes: string;
    }>(sql`
      SELECT
        (SELECT count(*) FROM vacancies)::text AS vacancies,
        (SELECT count(*) FROM companies)::text AS companies,
        (SELECT count(*) FROM nodes)::text AS nodes,
        (SELECT count(*) FROM nodes WHERE status = 'NEW')::text AS new_nodes
    `);
    const c = counts.rows[0];
    console.log(
      `\nFill done — attempted=${ids.length} succeeded=${succeeded} failed=${failed}`,
    );
    console.log(
      `Silver totals — vacancies=${c.vacancies} companies=${c.companies} nodes=${c.nodes} (status='NEW' awaiting moderation: ${c.new_nodes})`,
    );

    printCoverageReport(coverage, uncovered);
  } finally {
    await pool.end();
  }
}

// Probes the alias table for every (type, name) the loader is about to
// resolve, BEFORE the loader runs. Three buckets:
//   - matched-verified  (alias points at a VERIFIED node — taxonomy hit)
//   - matched-new       (alias points at a NEW node — already auto-created
//                        by an earlier record this run or a prior fill)
//   - created-new       (no alias — resolver will insert a NEW node)
// Side effect: increments the uncovered map for every NEW outcome so we
// can rank uncovered names at the end.
async function scoreMentions(
  db: ReturnType<typeof drizzle>,
  rssRecordId: string,
  coverage: CoverageStats,
  uncovered: Map<string, number>,
): Promise<void> {
  const [record] = await db
    .select({ extractedData: schema.rssRecords.extractedData })
    .from(schema.rssRecords)
    .where(eq(schema.rssRecords.id, rssRecordId));
  if (!record?.extractedData) return;
  const extracted = record.extractedData as ExtractedVacancy;

  const mentions: Array<{ type: NodeTypeValue; name: string }> = [];
  if (extracted.role) mentions.push({ type: "ROLE", name: extracted.role });
  if (extracted.domain)
    mentions.push({ type: "DOMAIN", name: extracted.domain });
  for (const s of extracted.skills?.required ?? []) {
    mentions.push({ type: "SKILL", name: s });
  }
  for (const s of extracted.skills?.optional ?? []) {
    mentions.push({ type: "SKILL", name: s });
  }

  for (const m of mentions) {
    const outcome = await probeMention(db, m.type, m.name);
    coverage[m.type][outcome]++;
    if (outcome !== "matched-verified") {
      const key = `${m.type}:${m.name.trim().toLowerCase()}`;
      uncovered.set(key, (uncovered.get(key) ?? 0) + 1);
    }
  }
}

async function probeMention(
  db: ReturnType<typeof drizzle>,
  type: NodeTypeValue,
  name: string,
): Promise<Outcome> {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return "created-new";
  const hits = await db
    .select({ status: schema.nodes.status })
    .from(schema.nodeAliases)
    .innerJoin(schema.nodes, eq(schema.nodes.id, schema.nodeAliases.nodeId))
    .where(
      and(
        eq(schema.nodeAliases.name, normalized),
        eq(schema.nodeAliases.type, type),
      ),
    );
  if (hits.length === 0) return "created-new";
  return hits[0].status === "VERIFIED" ? "matched-verified" : "matched-new";
}

function printCoverageReport(
  coverage: CoverageStats,
  uncovered: Map<string, number>,
): void {
  console.log("\n=== Taxonomy match coverage ===");
  for (const type of ["ROLE", "SKILL", "DOMAIN"] as const) {
    const s = coverage[type];
    const total = s["matched-verified"] + s["matched-new"] + s["created-new"];
    if (total === 0) {
      console.log(`${type}: no mentions`);
      continue;
    }
    const pct = (n: number) => ((n / total) * 100).toFixed(1);
    console.log(
      `${type}: ${total} mentions — VERIFIED ${s["matched-verified"]} (${pct(
        s["matched-verified"],
      )}%) | matched-NEW ${s["matched-new"]} (${pct(
        s["matched-new"],
      )}%) | created-NEW ${s["created-new"]} (${pct(s["created-new"])}%)`,
    );
  }

  if (uncovered.size === 0) {
    console.log("\nNo uncovered mentions — full taxonomy coverage 🎯");
    return;
  }

  const ranked = Array.from(uncovered.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, TOP_UNCOVERED);
  console.log(
    `\nTop ${ranked.length} uncovered mentions (candidates for libs/database/seeds/data/nodes.json):`,
  );
  for (const [key, count] of ranked) {
    const [type, ...rest] = key.split(":");
    console.log(`  ${count.toString().padStart(4)}  ${type.padEnd(7)} ${rest.join(":")}`);
  }
}

async function assertSilverSchemaExists(
  db: ReturnType<typeof drizzle>,
): Promise<void> {
  const result = await db.execute<{ has_silver: boolean }>(sql`
    SELECT to_regclass('public.vacancies') IS NOT NULL AS has_silver
  `);
  if (!result.rows[0]?.has_silver) {
    throw new Error(
      "Silver tables missing (vacancies). Apply migrations 0004 + 0005 first " +
        "(pnpm db:migrate). See md/runbook/loader-pipeline-smoke.md if your " +
        "local DB has the bronze tables but an empty drizzle migration tracking " +
        "table.",
    );
  }
}

main().catch((err) => {
  console.error("fill-vacancies FAILED:", err);
  process.exit(1);
});
