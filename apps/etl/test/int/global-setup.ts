import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";

// Boots one ephemeral pgvector Postgres for the whole integration run, applies
// the real Drizzle migrations, and exposes its URL via DATABASE_URL (read by
// the test db helper). The container handle is stashed on globalThis so
// global-teardown can stop it — both hooks run in the same Jest process.
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer(
    "pgvector/pgvector:pg17",
  ).start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  (globalThis as Record<string, unknown>).__PG_CONTAINER__ = container;

  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: resolve(__dirname, "../../../../libs/database/migrations"),
    });
  } finally {
    await pool.end();
  }
}
