import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../src/schema";

import { seedSampleCandidates } from "./candidates.seed";
import tracksData from "./data/tracks.json";
import { seedNodeSlugs } from "./node-slugs.seed";
import { seedNodes } from "./nodes.seed";
import { seedSources } from "./sources.seed";
import { seedTracks, type TrackSeed } from "./tracks.seed";

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? "postgres://metahunt:metahunt@localhost:54322/metahunt";
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  try {
    await seedSources(db);
    console.log("Seed: sources — done");
    await seedNodes(db);
    console.log("Seed: nodes — done");
    const filled = await seedNodeSlugs(db);
    console.log(`Seed: node slugs — done (${filled} filled)`);
    await seedTracks(db, tracksData as TrackSeed[]);
    console.log("Seed: tracks — done");
    await seedSampleCandidates(db);
    console.log("Seed: sample candidates — done");
  } finally {
    await pool.end();
  }
}

void main();
