import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { schema, type DrizzleDB } from "@metahunt/database";
import { Pool } from "pg";

// Connect to the container started in global-setup (URL via DATABASE_URL).
export function makeTestDb(): { db: DrizzleDB; pool: Pool } {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

// Wipe all tables between tests. Order doesn't matter with CASCADE; RESTART
// IDENTITY keeps any serials clean.
export async function truncateAll(db: DrizzleDB): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE
      candidate_nodes, candidates,
      vacancy_nodes, vacancies, node_aliases, nodes,
      company_identifiers, companies, rss_records, rss_ingests, sources
      RESTART IDENTITY CASCADE`,
  );
}
