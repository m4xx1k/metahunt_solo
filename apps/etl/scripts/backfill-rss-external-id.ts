import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { schema } from "@metahunt/database";
import { extractExternalId } from "../src/loader/external-id/source-external-id";

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgres://metahunt:metahunt@localhost:54322/metahunt";
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  try {
    const sources = await db
      .select({ id: schema.sources.id, code: schema.sources.code })
      .from(schema.sources);
    const sourceCodeById = new Map(sources.map((s) => [s.id, s.code]));

    const rows = await db
      .select({
        id: schema.rssRecords.id,
        sourceId: schema.rssRecords.sourceId,
        externalId: schema.rssRecords.externalId,
        link: schema.rssRecords.link,
      })
      .from(schema.rssRecords);

    let updated = 0;
    let unchanged = 0;
    let unparseable = 0;

    for (const row of rows) {
      const code = sourceCodeById.get(row.sourceId);
      if (!code) {
        console.warn(
          `Skipping rss_records.id=${row.id}: source ${row.sourceId} not found`,
        );
        unparseable++;
        continue;
      }
      try {
        const derived = extractExternalId(code, {
          guid: row.externalId ?? undefined,
          link: row.link ?? undefined,
        });
        if (derived === row.externalId) {
          unchanged++;
          continue;
        }
        await db
          .update(schema.rssRecords)
          .set({ externalId: derived })
          .where(eq(schema.rssRecords.id, row.id));
        updated++;
      } catch (err) {
        console.warn(
          `Cannot derive external_id for rss_records.id=${row.id} (source=${code}, externalId=${row.externalId}, link=${row.link}): ${(err as Error).message}`,
        );
        unparseable++;
      }
    }

    console.log(
      `Backfill rss_records.external_id — total=${rows.length}, updated=${updated}, unchanged=${unchanged}, unparseable=${unparseable}`,
    );
  } finally {
    await pool.end();
  }
}

void main();
