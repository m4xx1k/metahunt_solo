import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/schema';
import { seedTracks, type TrackSeed } from './tracks.seed';
import tracksData from './data/tracks.json';

// Tracks-only seed runner. The browse tree is pure references over existing
// nodes, so it must be re-runnable on its own: the full `db:seed` also runs
// `seedNodes`, which would revert moderated node statuses back to VERIFIED
// (see taxonomy-navigation.md). Use this after editing tracks.json to sync
// the tree (prune + upsert + relink) without touching nodes.
async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgres://metahunt:metahunt@localhost:54322/metahunt';
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  try {
    await seedTracks(db, tracksData as TrackSeed[]);
    console.log('Seed: tracks — done');
  } finally {
    await pool.end();
  }
}

void main();
