import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

// Connect to the container started in global-setup (URL via DATABASE_URL).
export function makeTestDb(): { db: DrizzleDB; pool: Pool } {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

// Wipe all tables between tests. Order doesn't matter with CASCADE; RESTART
// IDENTITY keeps any serials clean.
//
// `unique_vacancies` MUST be listed explicitly: it's the REFERENCED side of
// vacancies.unique_vacancy_id, so truncating `vacancies` alone leaves its
// groups behind — a leak `dedup.int.spec.ts`'s unscoped
// `SELECT count(*) FROM unique_vacancies` (groupCount()) is sensitive to, and
// which surfaced only once enough other suites' fixtures accumulated rows.
export async function truncateAll(db: DrizzleDB): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE
      candidate_nodes, candidates, users,
      vacancy_nodes, vacancies, unique_vacancies, node_aliases, nodes,
      company_identifiers, companies, rss_records, rss_ingests, sources
      RESTART IDENTITY CASCADE`,
  );
}
