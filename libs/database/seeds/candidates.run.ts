import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../src/schema";

import { seedSampleCandidates } from "./candidates.seed";

// Sample-candidates-only seed runner. Like tracks, samples are references over
// existing SKILL nodes, so they must be re-runnable alone: the full `db:seed`
// also runs `seedNodes`, which would revert moderated node statuses back to
// VERIFIED (see taxonomy-navigation.md). Use this to (re)seed the reverse-ATS
// demo profiles without touching nodes. Safe on prod data (only writes rows
// with candidate.type='sample' + their candidate_nodes links).
async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? "postgres://metahunt:metahunt@localhost:54322/metahunt";
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  try {
    await seedSampleCandidates(db);
    console.log("Seed: sample candidates — done");
  } finally {
    await pool.end();
  }
}

void main();
