import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgres://metahunt:metahunt@localhost:54322/metahunt';
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  try {
    await migrate(db, { migrationsFolder: './libs/database/migrations' });
    // eslint-disable-next-line no-console
    console.log('Migrations — done');
  } finally {
    await pool.end();
  }
}

void main();
