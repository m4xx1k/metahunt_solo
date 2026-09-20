import { eq } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { StalePostingsActivity } from "../../src/02-enrich/extraction/activities/stale-postings.activity";
import type {
  ExtractionIdentity,
  VacancyExtractor,
} from "../../src/02-enrich/extraction/vacancy-extractor";
import { DrizzleCompanyRepository } from "../../src/02-enrich/loader/repositories/company.repository";
import { DrizzleNodeRepository } from "../../src/02-enrich/loader/repositories/node.repository";
import { DrizzleVacancyRepository } from "../../src/02-enrich/loader/repositories/vacancy.repository";
import { CompanyResolverService } from "../../src/02-enrich/loader/services/company-resolver.service";
import { NodeResolverService } from "../../src/02-enrich/loader/services/node-resolver.service";
import { VacancyLoaderService } from "../../src/02-enrich/loader/services/vacancy-loader.service";

import { makeTestDb, truncateAll } from "./db";

const CURRENT_SPEC_HASH = "spec-current";

let db: DrizzleDB;
let pool: Pool;
let activity: StalePostingsActivity;
let loader: VacancyLoaderService;

// Only `identity()` is exercised here; the activity never extracts.
const extractor = {
  extract: () => {
    throw new Error("not used");
  },
  identity: () => Promise.resolve({ specHash: CURRENT_SPEC_HASH } as ExtractionIdentity),
} as unknown as VacancyExtractor;

const extracted = {
  role: "Backend Engineer",
  isTech: true,
  skills: { required: [{ anyOf: ["Go"] }], optional: [] },
  locations: [],
};

async function seedPosting(
  externalId: string,
  specHash: string | null,
  loadedAt: Date,
): Promise<string> {
  const [source] = await db
    .insert(schema.sources)
    .values({ code: `dou-${externalId}`, displayName: "DOU", baseUrl: "https://dou.ua" })
    .returning({ id: schema.sources.id });
  const [ingest] = await db
    .insert(schema.rssIngests)
    .values({ sourceId: source.id, triggeredBy: "test", startedAt: loadedAt })
    .returning({ id: schema.rssIngests.id });
  const [record] = await db
    .insert(schema.rssRecords)
    .values({
      sourceId: source.id,
      rssIngestId: ingest.id,
      externalId,
      hash: `hash-${externalId}`,
      publishedAt: loadedAt,
      title: `Engineer ${externalId}`,
      description: "Long description here.",
      extractedData: specHash ? { ...extracted, _extraction: { specHash } } : { ...extracted },
    })
    .returning({ id: schema.rssRecords.id });

  const vacancyId = await loader.loadFromRecord(record.id);
  if (!vacancyId) throw new Error("loadFromRecord returned null");
  const [vacancy] = await db
    .select()
    .from(schema.vacancies)
    .where(eq(schema.vacancies.id, vacancyId));
  await db
    .update(schema.uniqueVacancies)
    .set({ firstLoadedAt: loadedAt })
    .where(eq(schema.uniqueVacancies.id, vacancy.uniqueVacancyId));
  return record.id;
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
  const repo = new DrizzleVacancyRepository(db);
  loader = new VacancyLoaderService(
    repo,
    new CompanyResolverService(new DrizzleCompanyRepository(db)),
    new NodeResolverService(new DrizzleNodeRepository(db)),
  );
  activity = new StalePostingsActivity(db, extractor);
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await truncateAll(db);
});

describe("StalePostingsActivity.listStalePostings (integration)", () => {
  it("returns newest-first only the postings the current contract has not produced", async () => {
    const old = await seedPosting("old-contract", "spec-previous", new Date("2026-08-20"));
    const never = await seedPosting("never-extracted", null, new Date("2026-09-01"));
    await seedPosting("already-current", CURRENT_SPEC_HASH, new Date("2026-09-10"));

    expect(await activity.listStalePostings({ limit: 10 })).toEqual([never, old]);
  });

  it("honours the depth target: Positions first loaded before `since` are left alone", async () => {
    await seedPosting("older", "spec-previous", new Date("2026-08-18T23:00:00Z"));
    const inWindow = await seedPosting("newer", "spec-previous", new Date("2026-08-19T01:00:00Z"));

    expect(await activity.listStalePostings({ since: "2026-08-19", limit: 10 })).toEqual([
      inWindow,
    ]);
  });

  it("takes only the canonical posting of a Position, never its duplicates", async () => {
    const canonical = await seedPosting("canonical", "spec-previous", new Date("2026-09-05"));
    const duplicate = await seedPosting("duplicate", "spec-previous", new Date("2026-09-04"));

    // Fold the second posting into the first Position, as dedup does.
    const [canonicalVacancy] = await db
      .select()
      .from(schema.vacancies)
      .where(eq(schema.vacancies.lastRssRecordId, canonical));
    const [duplicateVacancy] = await db
      .select()
      .from(schema.vacancies)
      .where(eq(schema.vacancies.lastRssRecordId, duplicate));
    await db
      .update(schema.vacancies)
      .set({ uniqueVacancyId: canonicalVacancy.uniqueVacancyId })
      .where(eq(schema.vacancies.id, duplicateVacancy.id));
    await db
      .delete(schema.uniqueVacancies)
      .where(eq(schema.uniqueVacancies.id, duplicateVacancy.uniqueVacancyId));

    expect(await activity.listStalePostings({ limit: 10 })).toEqual([canonical]);
  });

  it("caps the batch at `limit`", async () => {
    await seedPosting("a", "spec-previous", new Date("2026-09-01"));
    await seedPosting("b", "spec-previous", new Date("2026-09-02"));
    await seedPosting("c", "spec-previous", new Date("2026-09-03"));

    expect(await activity.listStalePostings({ limit: 2 })).toHaveLength(2);
  });
});
