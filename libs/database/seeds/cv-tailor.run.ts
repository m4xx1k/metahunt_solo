import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../src/schema";

import { seedTailorSample } from "./cv-tailor.seed";

// Standalone seed for the /cv-tailor demo candidate (candidates.structured).
// Safe on prod data: writes exactly one candidate.type='sample' row + its links.
async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? "postgres://metahunt:metahunt@localhost:54322/metahunt";
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  try {
    await seedTailorSample(db);
    console.log("Seed: cv-tailor sample — done");
  } finally {
    await pool.end();
  }
}

void main();
