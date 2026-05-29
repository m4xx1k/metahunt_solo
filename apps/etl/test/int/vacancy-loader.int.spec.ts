import { count, eq } from "drizzle-orm";
import { schema, type DrizzleDB } from "@metahunt/database";
import type { Pool } from "pg";

import { DrizzleCompanyRepository } from "../../src/loader/repositories/company.repository";
import { DrizzleNodeRepository } from "../../src/loader/repositories/node.repository";
import { DrizzleVacancyRepository } from "../../src/loader/repositories/vacancy.repository";
import { CompanyResolverService } from "../../src/loader/services/company-resolver.service";
import { NodeResolverService } from "../../src/loader/services/node-resolver.service";
import { VacancyLoaderService } from "../../src/loader/services/vacancy-loader.service";
import { makeTestDb, truncateAll } from "./db";

const PUBLISHED_AT = new Date("2026-04-24T10:00:00.000Z");

const fullExtracted = {
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
};

let db: DrizzleDB;
let pool: Pool;
let loader: VacancyLoaderService;
let vacancyRepo: DrizzleVacancyRepository;

// Real repos + real services wired by hand against the live db — exactly the
// production object graph minus Nest's DI container.
function buildLoader(database: DrizzleDB): {
  loader: VacancyLoaderService;
  vacancyRepo: DrizzleVacancyRepository;
} {
  const repo = new DrizzleVacancyRepository(database);
  const loaderSvc = new VacancyLoaderService(
    repo,
    new CompanyResolverService(new DrizzleCompanyRepository(database)),
    new NodeResolverService(new DrizzleNodeRepository(database)),
  );
  return { loader: loaderSvc, vacancyRepo: repo };
}

// Arrange the bronze chain loadFromRecord reads: one source+ingest, then any
// number of records under it (so an upsert test can reuse the same source).
async function seedSource(): Promise<{ sourceId: string; ingestId: string }> {
  const [source] = await db
    .insert(schema.sources)
    .values({ code: "dou", displayName: "DOU", baseUrl: "https://dou.ua" })
    .returning({ id: schema.sources.id });
  const [ingest] = await db
    .insert(schema.rssIngests)
    .values({ sourceId: source.id, triggeredBy: "test", startedAt: new Date() })
    .returning({ id: schema.rssIngests.id });
  return { sourceId: source.id, ingestId: ingest.id };
}

async function seedRecord(
  sourceId: string,
  ingestId: string,
  extractedData: unknown,
  overrides: { externalId?: string; title?: string } = {},
): Promise<string> {
  const externalId = overrides.externalId ?? "100001";
  const title = overrides.title ?? "Senior Backend Engineer";
  const [record] = await db
    .insert(schema.rssRecords)
    .values({
      sourceId,
      rssIngestId: ingestId,
      externalId,
      hash: `hash-${externalId}-${title}`,
      publishedAt: PUBLISHED_AT,
      title,
      description: "Long description here.",
      extractedData,
    })
    .returning({ id: schema.rssRecords.id });
  return record.id;
}

async function rowCount(
  table: typeof schema.companies | typeof schema.nodes | typeof schema.vacancies,
): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(table);
  return n;
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
  ({ loader, vacancyRepo } = buildLoader(db));
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await truncateAll(db);
  jest.restoreAllMocks();
});

describe("VacancyLoaderService.loadFromRecord (integration)", () => {
  it("loads a full payload: vacancy + resolved company/role/domain/skills", async () => {
    const { sourceId, ingestId } = await seedSource();
    const recordId = await seedRecord(sourceId, ingestId, fullExtracted);

    const vacancyId = await loader.loadFromRecord(recordId);

    const [vac] = await db
      .select()
      .from(schema.vacancies)
      .where(eq(schema.vacancies.id, vacancyId));
    expect(vac.title).toBe("Senior Backend Engineer");
    expect(vac.seniority).toBe("SENIOR");
    expect(vac.salaryMin).toBe(4000);
    expect(vac.currency).toBe("USD");
    expect(vac.companyId).not.toBeNull();
    expect(vac.roleNodeId).not.toBeNull();
    expect(vac.domainNodeId).not.toBeNull();
    expect(vac.publishedAt?.toISOString()).toBe(PUBLISHED_AT.toISOString());

    // role + domain + 3 skills = 5 nodes; company resolved once.
    expect(await rowCount(schema.companies)).toBe(1);
    expect(await rowCount(schema.nodes)).toBe(5);

    const links = await db
      .select()
      .from(schema.vacancyNodes)
      .where(eq(schema.vacancyNodes.vacancyId, vacancyId));
    expect(links).toHaveLength(3);
    expect(links.filter((l) => l.isRequired)).toHaveLength(2);
  });

  it("upserts on the same (source, external_id): one row, fields updated, skills rewritten", async () => {
    const { sourceId, ingestId } = await seedSource();
    const first = await seedRecord(sourceId, ingestId, fullExtracted);
    const vacancyId = await loader.loadFromRecord(first);

    // Same source + external_id, new title + a different skill set.
    const second = await seedRecord(
      sourceId,
      ingestId,
      { ...fullExtracted, skills: { required: ["Rust"], optional: [] } },
      { externalId: "100001", title: "Staff Backend Engineer" },
    );
    const vacancyId2 = await loader.loadFromRecord(second);

    expect(vacancyId2).toBe(vacancyId); // same vacancy, not a new one
    expect(await rowCount(schema.vacancies)).toBe(1);

    const [vac] = await db
      .select()
      .from(schema.vacancies)
      .where(eq(schema.vacancies.id, vacancyId));
    expect(vac.title).toBe("Staff Backend Engineer");

    const links = await db
      .select()
      .from(schema.vacancyNodes)
      .where(eq(schema.vacancyNodes.vacancyId, vacancyId));
    expect(links).toHaveLength(1); // skills fully rewritten to just Rust
  });

  it("rolls back the whole load when the vacancy write fails — no orphan company/node rows", async () => {
    const { sourceId, ingestId } = await seedSource();
    const recordId = await seedRecord(sourceId, ingestId, fullExtracted);

    // Make the vacancy upsert throw AFTER company/node resolution has already
    // written rows on the transaction. The single tx must roll back all of it.
    jest
      .spyOn(vacancyRepo, "upsertWithSkills")
      .mockRejectedValueOnce(new Error("boom"));

    await expect(loader.loadFromRecord(recordId)).rejects.toThrow("boom");

    // The headline guarantee from slice 3: resolution can't commit on its own.
    expect(await rowCount(schema.companies)).toBe(0);
    expect(await rowCount(schema.nodes)).toBe(0);
    expect(await rowCount(schema.vacancies)).toBe(0);
  });
});
