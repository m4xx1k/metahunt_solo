import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/schema';
import { seedNodeSlugs } from './node-slugs.seed';

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgres://metahunt:metahunt@localhost:54322/metahunt';
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  try {
    const filled = await seedNodeSlugs(db);
    console.log(`Seed: node slugs — done (${filled} filled)`);
  } finally {
    await pool.end();
  }
}
void main();
