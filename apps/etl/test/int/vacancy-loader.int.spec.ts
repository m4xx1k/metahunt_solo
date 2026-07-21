import { count, eq } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { DrizzleCompanyRepository } from "../../src/02-enrich/loader/repositories/company.repository";
import { DrizzleNodeRepository } from "../../src/02-enrich/loader/repositories/node.repository";
import { DrizzleVacancyRepository } from "../../src/02-enrich/loader/repositories/vacancy.repository";
import { CompanyResolverService } from "../../src/02-enrich/loader/services/company-resolver.service";
import { NodeResolverService } from "../../src/02-enrich/loader/services/node-resolver.service";
import { VacancyLoaderService } from "../../src/02-enrich/loader/services/vacancy-loader.service";

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
  overrides: {
    externalId?: string;
    title?: string;
    createdAt?: Date;
    publishedAt?: Date;
  } = {},
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
      publishedAt: overrides.publishedAt ?? PUBLISHED_AT,
      title,
      description: "Long description here.",
      extractedData,
      createdAt: overrides.createdAt,
    })
    .returning({ id: schema.rssRecords.id });
  return record.id;
}

async function rowCount(
  table:
    | typeof schema.companies
    | typeof schema.nodes
    | typeof schema.vacancies
    | typeof schema.uniqueVacancies,
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
    if (!vacancyId) throw new Error("loadFromRecord returned null");

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
    const first = await seedRecord(sourceId, ingestId, fullExtracted, {
      createdAt: new Date("2026-04-24T10:00:00.000Z"),
    });
    const vacancyId = await loader.loadFromRecord(first);
    if (!vacancyId) throw new Error("loadFromRecord returned null");

    // Same source + external_id, new title + a different skill set.
    const second = await seedRecord(
      sourceId,
      ingestId,
      { ...fullExtracted, skills: { required: ["Rust"], optional: [] } },
      {
        externalId: "100001",
        title: "Staff Backend Engineer",
        createdAt: new Date("2026-04-25T10:00:00.000Z"),
      },
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

  it("does not let an older source record overwrite a newer listing", async () => {
    const { sourceId, ingestId } = await seedSource();
    const newer = await seedRecord(
      sourceId,
      ingestId,
      { ...fullExtracted, skills: { required: ["Rust"], optional: [] } },
      {
        title: "Current Backend Engineer",
        createdAt: new Date("2026-04-25T10:00:00.000Z"),
      },
    );
    const older = await seedRecord(
      sourceId,
      ingestId,
      { ...fullExtracted, skills: { required: ["Go"], optional: [] } },
      {
        title: "Stale Backend Engineer",
        createdAt: new Date("2026-04-24T10:00:00.000Z"),
      },
    );

    const vacancyId = await loader.loadFromRecord(newer);
    if (!vacancyId) throw new Error("loadFromRecord returned null");
    expect(await loader.loadFromRecord(older)).toBe(vacancyId);

    const [vacancy] = await db
      .select()
      .from(schema.vacancies)
      .where(eq(schema.vacancies.id, vacancyId));
    expect(vacancy.title).toBe("Current Backend Engineer");
    expect(vacancy.lastRssRecordId).toBe(newer);

    const linkedSkills = await db
      .select({ name: schema.nodes.canonicalName })
      .from(schema.vacancyNodes)
      .innerJoin(schema.nodes, eq(schema.nodes.id, schema.vacancyNodes.nodeId))
      .where(eq(schema.vacancyNodes.vacancyId, vacancyId));
    expect(linkedSkills.map(({ name }) => name)).toEqual(["Rust"]);
  });

  it("invalidates semantic derivatives and removes an emptied cluster on a newer version", async () => {
    const { sourceId, ingestId } = await seedSource();
    const first = await seedRecord(sourceId, ingestId, fullExtracted, {
      createdAt: new Date("2026-04-24T10:00:00.000Z"),
    });
    const vacancyId = await loader.loadFromRecord(first);
    if (!vacancyId) throw new Error("loadFromRecord returned null");

    const embedding = Array.from({ length: 1536 }, () => 0.01);
    await db
      .update(schema.vacancies)
      .set({
        embedding,
        embeddingModel: "test-model",
        embeddingSourceHash: "old-content-hash",
      })
      .where(eq(schema.vacancies.id, vacancyId));
    const [cluster] = await db
      .insert(schema.uniqueVacancies)
      .values({
        canonicalVacancyId: vacancyId,
        centroidEmbedding: embedding,
        sourceCount: 1,
        vacancyCount: 1,
        firstSeenAt: PUBLISHED_AT,
        lastSeenAt: PUBLISHED_AT,
      })
      .returning({ id: schema.uniqueVacancies.id });
    await db
      .update(schema.vacancies)
      .set({ uniqueVacancyId: cluster.id, dedupReason: { method: "test" } })
      .where(eq(schema.vacancies.id, vacancyId));

    const second = await seedRecord(
      sourceId,
      ingestId,
      { ...fullExtracted, skills: { required: ["Rust"], optional: [] } },
      {
        title: "Updated Backend Engineer",
        createdAt: new Date("2026-04-25T10:00:00.000Z"),
      },
    );
    await loader.loadFromRecord(second);

    const [vacancy] = await db
      .select()
      .from(schema.vacancies)
      .where(eq(schema.vacancies.id, vacancyId));
    expect(vacancy).toMatchObject({
      title: "Updated Backend Engineer",
      lastRssRecordId: second,
      embedding: null,
      embeddingModel: null,
      embeddingSourceHash: null,
      uniqueVacancyId: null,
      dedupReason: null,
    });
    expect(await rowCount(schema.uniqueVacancies)).toBe(0);
  });

  it("repairs a non-empty cluster when its canonical listing receives a newer version", async () => {
    const { sourceId, ingestId } = await seedSource();
    const firstPublishedAt = new Date("2026-04-24T10:00:00.000Z");
    const secondPublishedAt = new Date("2026-04-25T10:00:00.000Z");
    const firstRecord = await seedRecord(sourceId, ingestId, fullExtracted, {
      externalId: "100001",
      title: "First Backend Engineer",
      createdAt: firstPublishedAt,
      publishedAt: firstPublishedAt,
    });
    const secondRecord = await seedRecord(sourceId, ingestId, fullExtracted, {
      externalId: "100002",
      title: "Second Backend Engineer",
      createdAt: secondPublishedAt,
      publishedAt: secondPublishedAt,
    });
    const firstVacancyId = await loader.loadFromRecord(firstRecord);
    const secondVacancyId = await loader.loadFromRecord(secondRecord);
    if (!firstVacancyId || !secondVacancyId) throw new Error("loadFromRecord returned null");

    const embedding = Array.from({ length: 1536 }, () => 0.01);
    await db
      .update(schema.vacancies)
      .set({ embedding, embeddingModel: "test-model", embeddingSourceHash: "content-hash" });
    const [cluster] = await db
      .insert(schema.uniqueVacancies)
      .values({
        canonicalVacancyId: firstVacancyId,
        centroidEmbedding: embedding,
        sourceCount: 1,
        vacancyCount: 2,
        firstSeenAt: firstPublishedAt,
        lastSeenAt: secondPublishedAt,
      })
      .returning({ id: schema.uniqueVacancies.id });
    await db.update(schema.vacancies).set({ uniqueVacancyId: cluster.id });

    const replacementRecord = await seedRecord(sourceId, ingestId, fullExtracted, {
      externalId: "100001",
      title: "Updated First Backend Engineer",
      createdAt: new Date("2026-04-26T10:00:00.000Z"),
      publishedAt: new Date("2026-04-26T10:00:00.000Z"),
    });
    await loader.loadFromRecord(replacementRecord);

    const [repaired] = await db
      .select()
      .from(schema.uniqueVacancies)
      .where(eq(schema.uniqueVacancies.id, cluster.id));
    expect(repaired).toMatchObject({
      canonicalVacancyId: secondVacancyId,
      sourceCount: 1,
      vacancyCount: 1,
    });
    expect(repaired.firstSeenAt.toISOString()).toBe(secondPublishedAt.toISOString());
    expect(repaired.lastSeenAt.toISOString()).toBe(secondPublishedAt.toISOString());

    const [updatedFirst] = await db
      .select()
      .from(schema.vacancies)
      .where(eq(schema.vacancies.id, firstVacancyId));
    expect(updatedFirst.uniqueVacancyId).toBeNull();
    expect(updatedFirst.embedding).toBeNull();
  });

  it("rolls back the whole load when the vacancy write fails — no orphan company/node rows", async () => {
    const { sourceId, ingestId } = await seedSource();
    const recordId = await seedRecord(sourceId, ingestId, fullExtracted);

    // Make the vacancy upsert throw AFTER company/node resolution has already
    // written rows on the transaction. The single tx must roll back all of it.
    jest.spyOn(vacancyRepo, "upsertWithSkills").mockRejectedValueOnce(new Error("boom"));

    await expect(loader.loadFromRecord(recordId)).rejects.toThrow("boom");

    // The headline guarantee from slice 3: resolution can't commit on its own.
    expect(await rowCount(schema.companies)).toBe(0);
    expect(await rowCount(schema.nodes)).toBe(0);
    expect(await rowCount(schema.vacancies)).toBe(0);
  });
});
