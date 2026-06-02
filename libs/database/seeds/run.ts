import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/schema';
import { seedSources } from './sources.seed';
import { seedNodes } from './nodes.seed';
import { seedTracks, type TrackSeed } from './tracks.seed';
import tracksData from './data/tracks.json';

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgres://metahunt:metahunt@localhost:54322/metahunt';
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  try {
    await seedSources(db);
    console.log('Seed: sources — done');
    await seedNodes(db);
    console.log('Seed: nodes — done');
    await seedTracks(db, tracksData as TrackSeed[]);
    console.log('Seed: tracks — done');
  } finally {
    await pool.end();
  }
}

void main();
