// One-shot bulk fill: walks every rss_records row with extracted_at
// set but no matching vacancies row, runs VacancyLoaderService against
// each one, and reports per-batch progress + a final summary.
//
// Run:
//   npx ts-node --project apps/etl/tsconfig.json apps/etl/scripts/fill-vacancies.ts [limit]
//
//   limit — max records to process (default: all pending)
//
// Same loader path the HTTP endpoint /loader/backfill uses; this script
// just bypasses Nest+HTTP for one-off CLI use against any DATABASE_URL.
//
// Preconditions:
//   - migrations 0004 + 0005 applied (vacancies/nodes/companies/...
//     tables exist; rss_records.external_id is NOT NULL).
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
import { sql } from "drizzle-orm";
import { Pool } from "pg";

import { DRIZZLE, schema } from "@metahunt/database";

import { CompanyResolverService } from "../src/loader/services/company-resolver.service";
import { NodeResolverService } from "../src/loader/services/node-resolver.service";
import { VacancyLoaderService } from "../src/loader/services/vacancy-loader.service";

const PROGRESS_EVERY = 10;

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

    // Same predicate as LoaderBackfillService.loadMissing — kept inline
    // here because we want streaming-style progress, not a single batch
    // resolved-then-reported result.
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

    let succeeded = 0;
    let failed = 0;
    const startedAt = Date.now();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
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
      `Fill done — attempted=${ids.length} succeeded=${succeeded} failed=${failed}`,
    );
    console.log(
      `Silver totals — vacancies=${c.vacancies} companies=${c.companies} nodes=${c.nodes} (status='NEW' awaiting moderation: ${c.new_nodes})`,
    );
  } finally {
    await pool.end();
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
