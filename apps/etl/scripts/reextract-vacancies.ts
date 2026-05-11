// One-shot re-extraction harness. Walks every rss_records row, clears its
// extracted_at + extracted_data, then re-runs the BAML extractor against
// the current prompt. Used after a prompt-version bump to refresh stored
// extractions before measuring taxonomy coverage with fill-vacancies.ts.
//
// Run:
//   pnpm exec ts-node --project tsconfig.json apps/etl/scripts/reextract-vacancies.ts [limit]
//
//   limit — max records to re-extract (default: all)
//
// What happens:
//   1. Loads every rss_records id (oldest first).
//   2. For each: BamlVacancyExtractor.extract(title + description),
//      then writes the new extracted_data + _v + _usage sidecar back.
//   3. Failures persist `{ _v, _usage, _error }` so the cost of the
//      failed attempt still lands in the extraction_cost view.
//
// Costs real money (OpenAI calls). At gpt-4o-mini pricing ~ $0.001/record.

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { asc, eq } from "drizzle-orm";
import { Pool } from "pg";

import { schema } from "@metahunt/database";

import { BamlVacancyExtractor } from "../src/extraction/baml.extractor";
import { MODEL_PRICING_USD_PER_MTOK } from "../src/extraction/pricing";

const PROGRESS_EVERY = 5;

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
    const rows = await db
      .select({
        id: schema.rssRecords.id,
        title: schema.rssRecords.title,
        description: schema.rssRecords.description,
      })
      .from(schema.rssRecords)
      .orderBy(asc(schema.rssRecords.createdAt))
      .limit(Math.min(limit, Number.MAX_SAFE_INTEGER));

    console.log(`Re-extracting ${rows.length} record(s)...`);

    // Manual DI — BamlVacancyExtractor's @Inject decorator only registers
    // Nest metadata; at runtime it's a plain constructor parameter.
    const extractor = new BamlVacancyExtractor(db);

    let succeeded = 0;
    let failed = 0;
    let totalIn = 0;
    let totalOut = 0;
    let totalCached = 0;
    const startedAt = Date.now();

    for (let i = 0; i < rows.length; i++) {
      const { id, title, description } = rows[i];
      const text = `Title: ${title}\n\n${description ?? ""}`;
      try {
        const result = await extractor.extract(text);
        const sidecar = {
          _v: result.meta.promptVersion,
          _usage: result.meta.usage,
        };
        totalIn += result.meta.usage.in;
        totalOut += result.meta.usage.out;
        totalCached += result.meta.usage.cached;

        if (!result.data) {
          await db
            .update(schema.rssRecords)
            .set({
              extractedData: { ...sidecar, _error: result.meta.error },
              extractedAt: new Date(),
            })
            .where(eq(schema.rssRecords.id, id));
          failed++;
        } else {
          await db
            .update(schema.rssRecords)
            .set({
              extractedData: { ...result.data, ...sidecar },
              extractedAt: new Date(),
            })
            .where(eq(schema.rssRecords.id, id));
          succeeded++;
        }
      } catch (err) {
        failed++;
        console.warn(
          `  [${i + 1}/${rows.length}] FAILED ${id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      if ((i + 1) % PROGRESS_EVERY === 0 || i + 1 === rows.length) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        const rate = ((i + 1) / Number(elapsed)).toFixed(2);
        console.log(
          `  [${i + 1}/${rows.length}] succeeded=${succeeded} failed=${failed} ` +
            `elapsed=${elapsed}s (${rate}/s) ` +
            `tok_in=${totalIn} tok_out=${totalOut} cached=${totalCached}`,
        );
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log("");
    console.log("=== Re-extraction summary ===");
    console.log(`Records:   ${rows.length}`);
    console.log(`Succeeded: ${succeeded}`);
    console.log(`Failed:    ${failed}`);
    console.log(`Elapsed:   ${elapsed}s`);
    console.log(`Tokens:    in=${totalIn} out=${totalOut} cached=${totalCached}`);

    const model = process.env.OPENAI_MODEL ?? "unknown";
    const rates =
      MODEL_PRICING_USD_PER_MTOK[
        model as keyof typeof MODEL_PRICING_USD_PER_MTOK
      ];
    if (rates) {
      const cost =
        ((totalIn - totalCached) * rates.in +
          totalOut * rates.out +
          totalCached * rates.cachedIn) /
        1e6;
      console.log(`Cost:      $${cost.toFixed(4)} (${model})`);
    } else {
      console.log(`Cost:      unknown — no pricing entry for "${model}"`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
