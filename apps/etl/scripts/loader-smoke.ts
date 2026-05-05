// E2E smoke: spins up an isolated `metahunt_loader_smoke` database, applies
// every migration, seeds a couple of rss_records with realistic
// extractedData payloads, runs VacancyLoaderService directly, and asserts
// the expected silver-layer + node moderation queue rows materialize.
//
// Run: pnpm tsx apps/etl/scripts/loader-smoke.ts
//
// Idempotent: drops the smoke DB at the end. Safe to re-run.

import "dotenv/config";
import { execSync } from "node:child_process";
import { Test } from "@nestjs/testing";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";

import { DRIZZLE, schema } from "@metahunt/database";

import { CompanyResolverService } from "../src/loader/services/company-resolver.service";
import { NodeResolverService } from "../src/loader/services/node-resolver.service";
import { VacancyLoaderService } from "../src/loader/services/vacancy-loader.service";

const ADMIN_URL =
  process.env.LOADER_SMOKE_ADMIN_URL ??
  "postgres://metahunt:metahunt@localhost:54322/postgres";
const SMOKE_DB = "metahunt_loader_smoke";
const SMOKE_URL = ADMIN_URL.replace(/\/postgres$/, `/${SMOKE_DB}`);

const SOURCE_ID = "11111111-1111-1111-1111-111111111111";
const INGEST_ID = "22222222-2222-2222-2222-222222222222";
const RECORD_A = "33333333-3333-3333-3333-333333333333";
const RECORD_B = "44444444-4444-4444-4444-444444444444";

async function withAdminPool<T>(fn: (db: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: ADMIN_URL });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

async function dropDb(): Promise<void> {
  await withAdminPool(async (pool) => {
    await pool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [SMOKE_DB],
    );
    await pool.query(`DROP DATABASE IF EXISTS ${SMOKE_DB}`);
  });
}

async function createDb(): Promise<void> {
  await withAdminPool(async (pool) => {
    await pool.query(`CREATE DATABASE ${SMOKE_DB}`);
  });
}

async function seedRecords(): Promise<void> {
  const pool = new Pool({ connectionString: SMOKE_URL });
  const db = drizzle(pool, { schema });
  try {
    await db.insert(schema.sources).values({
      id: SOURCE_ID,
      code: "djinni",
      displayName: "Djinni",
      baseUrl: "https://djinni.co",
      rssUrl: "https://djinni.co/jobs/rss/",
    });

    await db.insert(schema.rssIngests).values({
      id: INGEST_ID,
      sourceId: SOURCE_ID,
      triggeredBy: "smoke",
      startedAt: new Date(),
      status: "completed",
    });

    await db.insert(schema.rssRecords).values([
      {
        id: RECORD_A,
        sourceId: SOURCE_ID,
        rssIngestId: INGEST_ID,
        externalId: "100001",
        hash: "smoke-hash-a",
        publishedAt: new Date(),
        title: "Senior Backend Engineer",
        description: "Backend role with Go and PostgreSQL.",
        link: "https://djinni.co/jobs/100001-senior-backend/",
        category: "Backend",
        extractedAt: new Date(),
        extractedData: {
          role: "Backend Engineer",
          seniority: "SENIOR",
          skills: { required: ["Go", "PostgreSQL"], optional: ["Docker"] },
          experienceYears: 3,
          salary: { min: 4000, max: 6000, currency: "USD" },
          englishLevel: "UPPER_INTERMEDIATE",
          employmentType: "FULL_TIME",
          workFormat: "REMOTE",
          locations: [{ city: "Kyiv", country: "Ukraine" }],
          domain: "FinTech",
          engagementType: "PRODUCT",
          companyName: "Acme Corp",
          hasTestAssignment: true,
          hasReservation: false,
        },
      },
      {
        id: RECORD_B,
        sourceId: SOURCE_ID,
        rssIngestId: INGEST_ID,
        externalId: "100002",
        hash: "smoke-hash-b",
        publishedAt: new Date(),
        title: "Frontend Developer",
        description: "React + TypeScript at the same Acme Corp.",
        link: "https://djinni.co/jobs/100002-frontend-dev/",
        category: "Frontend",
        extractedAt: new Date(),
        extractedData: {
          role: "Frontend Developer",
          seniority: "MIDDLE",
          skills: {
            required: ["TypeScript", "React"],
            optional: [],
          },
          experienceYears: 2,
          salary: null,
          englishLevel: "INTERMEDIATE",
          employmentType: "FULL_TIME",
          workFormat: "HYBRID",
          locations: [{ city: "Lviv", country: "Ukraine" }],
          domain: null,
          engagementType: "PRODUCT",
          companyName: "Acme Corp",
          hasTestAssignment: false,
          hasReservation: null,
        },
      },
    ]);
  } finally {
    await pool.end();
  }
}

async function runLoader(): Promise<void> {
  const pool = new Pool({ connectionString: SMOKE_URL });
  const db = drizzle(pool, { schema });
  try {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CompanyResolverService,
        NodeResolverService,
        VacancyLoaderService,
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();
    const loader = moduleRef.get(VacancyLoaderService);

    const vacancyA = await loader.loadFromRecord(RECORD_A);
    const vacancyB = await loader.loadFromRecord(RECORD_B);
    console.log(`Loaded vacancyA=${vacancyA} vacancyB=${vacancyB}`);

    // Re-run on RECORD_A to prove latest-wins (should be a no-op).
    const vacancyARerun = await loader.loadFromRecord(RECORD_A);
    if (vacancyARerun !== vacancyA) {
      throw new Error(
        `Re-running loader produced a different vacancy id (${vacancyARerun} vs ${vacancyA}); expected idempotent`,
      );
    }
  } finally {
    await pool.end();
  }
}

async function assertResults(): Promise<void> {
  const pool = new Pool({ connectionString: SMOKE_URL });
  const db = drizzle(pool, { schema });
  try {
    const vacancies = await db.select().from(schema.vacancies);
    if (vacancies.length !== 2) {
      throw new Error(`Expected 2 vacancies, got ${vacancies.length}`);
    }

    const companies = await db.select().from(schema.companies);
    if (companies.length !== 1) {
      throw new Error(
        `Expected 1 company (both records share Acme Corp), got ${companies.length}`,
      );
    }

    const nodes = await db.select().from(schema.nodes);
    const nodesByType = nodes.reduce<Record<string, number>>((acc, n) => {
      acc[n.type] = (acc[n.type] ?? 0) + 1;
      return acc;
    }, {});
    // ROLE: Backend Engineer, Frontend Developer (2)
    // SKILL: Go, PostgreSQL, Docker, TypeScript, React (5)
    // DOMAIN: FinTech (1)
    if (nodesByType.ROLE !== 2)
      throw new Error(`Expected 2 ROLE nodes, got ${nodesByType.ROLE}`);
    if (nodesByType.SKILL !== 5)
      throw new Error(`Expected 5 SKILL nodes, got ${nodesByType.SKILL}`);
    if (nodesByType.DOMAIN !== 1)
      throw new Error(`Expected 1 DOMAIN node, got ${nodesByType.DOMAIN}`);

    const newNodes = nodes.filter((n) => n.status === "NEW");
    if (newNodes.length !== nodes.length) {
      throw new Error(
        `All nodes should default to status='NEW' for moderation; ${newNodes.length}/${nodes.length}`,
      );
    }

    const aliases = await db.select().from(schema.nodeAliases);
    if (aliases.length !== nodes.length) {
      throw new Error(
        `Each node should have one alias; nodes=${nodes.length} aliases=${aliases.length}`,
      );
    }
    for (const alias of aliases) {
      if (alias.name !== alias.name.toLowerCase()) {
        throw new Error(
          `Alias not normalized to lowercase: '${alias.name}'`,
        );
      }
    }

    const skillLinks = await db
      .select()
      .from(schema.vacancyNodes)
      .where(eq(schema.vacancyNodes.isRequired, true));
    // RECORD_A: Go, PostgreSQL required (2). RECORD_B: TypeScript, React (2). Total 4.
    if (skillLinks.length !== 4) {
      throw new Error(
        `Expected 4 required skill links, got ${skillLinks.length}`,
      );
    }

    const optionalLinks = await db
      .select()
      .from(schema.vacancyNodes)
      .where(eq(schema.vacancyNodes.isRequired, false));
    // Docker only on RECORD_A.
    if (optionalLinks.length !== 1) {
      throw new Error(
        `Expected 1 optional skill link, got ${optionalLinks.length}`,
      );
    }

    console.log(
      `Smoke OK — vacancies=${vacancies.length} companies=${companies.length} ` +
        `nodes=${nodes.length} (ROLE=${nodesByType.ROLE} SKILL=${nodesByType.SKILL} DOMAIN=${nodesByType.DOMAIN}) ` +
        `aliases=${aliases.length} required-skills=${skillLinks.length} optional-skills=${optionalLinks.length}`,
    );
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  console.log(`Loader smoke against ${SMOKE_URL}`);
  await dropDb();
  await createDb();
  console.log("DB created");

  // Re-use the project's migrate.ts via the existing pnpm script with an
  // overridden DATABASE_URL so we exercise the same migration path prod uses.
  execSync(`pnpm db:migrate`, {
    cwd: `${__dirname}/../../..`,
    env: { ...process.env, DATABASE_URL: SMOKE_URL },
    stdio: "inherit",
  });
  console.log("Migrations applied");

  await seedRecords();
  console.log("Seeded 2 rss_records");

  await runLoader();
  await assertResults();

  await dropDb();
  console.log("Smoke DB dropped — done");
}

main().catch(async (err) => {
  console.error("Smoke FAILED:", err);
  try {
    await dropDb();
  } catch {
    /* best effort */
  }
  process.exit(1);
});
