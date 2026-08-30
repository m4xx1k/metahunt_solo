import { eq } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { CoverageService } from "../../src/admin/coverage/coverage.service";

import { makeTestDb, truncateAll } from "./db";
import { insertVacancyWithGroup } from "./vacancy-fixture";

let db: DrizzleDB;
let pool: Pool;
let coverage: CoverageService;
let seq = 0;

// Coverage's host->source map is hardcoded to real board hostnames, so the
// fixture source codes must match production exactly — unlike most int specs
// here, a synthetic `src-N` code cannot stand in for it.
async function seedSource(code: "dou" | "djinni"): Promise<{ sourceId: string; ingestId: string }> {
  const [source] = await db
    .insert(schema.sources)
    .values({
      code,
      displayName: code,
      baseUrl: code === "dou" ? "https://jobs.dou.ua" : "https://djinni.co",
    })
    .returning({ id: schema.sources.id });
  const [ingest] = await db
    .insert(schema.rssIngests)
    .values({
      sourceId: source.id,
      triggeredBy: "test",
      startedAt: new Date(),
      status: "completed",
    })
    .returning({ id: schema.rssIngests.id });
  return { sourceId: source.id, ingestId: ingest.id };
}

async function seedRecord(opts: {
  sourceId: string;
  ingestId: string;
  externalId: string;
  title: string;
  link: string;
  publishedAt: Date;
}): Promise<string> {
  const [rec] = await db
    .insert(schema.rssRecords)
    .values({
      sourceId: opts.sourceId,
      rssIngestId: opts.ingestId,
      externalId: opts.externalId,
      hash: `hash-${++seq}`,
      title: opts.title,
      link: opts.link,
      publishedAt: opts.publishedAt,
    })
    .returning({ id: schema.rssRecords.id });
  return rec.id;
}

async function seedVacancy(opts: {
  sourceId: string;
  ingestId: string;
  externalId: string;
  title: string;
  link: string;
  publishedAt: Date;
  loadedAt?: Date;
}): Promise<{ vacancyId: string; recordId: string }> {
  const recordId = await seedRecord(opts);
  const vacancyId = await insertVacancyWithGroup(db, {
    sourceId: opts.sourceId,
    externalId: opts.externalId,
    lastRssRecordId: recordId,
    title: opts.title,
    publishedAt: opts.publishedAt,
    ...(opts.loadedAt ? { loadedAt: opts.loadedAt } : {}),
  });
  return { vacancyId, recordId };
}

async function seedVerifiedRole(name: string): Promise<string> {
  const [node] = await db
    .insert(schema.nodes)
    .values({ type: "ROLE", status: "VERIFIED", canonicalName: name })
    .returning({ id: schema.nodes.id });
  return node.id;
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
  coverage = new CoverageService(db);
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await truncateAll(db);
});

describe("CoverageService.lookup", () => {
  it("finds a DOU vacancy by URL and reports its ingest lag", async () => {
    const { sourceId, ingestId } = await seedSource("dou");
    const roleId = await seedVerifiedRole("Backend Engineer");
    const publishedAt = new Date("2026-08-20T10:00:00Z");
    const loadedAt = new Date("2026-08-20T10:45:00Z");
    const { vacancyId } = await seedVacancy({
      sourceId,
      ingestId,
      externalId: "350774",
      title: "Senior Backend Engineer",
      link: "https://jobs.dou.ua/companies/acme/vacancies/350774/",
      publishedAt,
      loadedAt,
    });
    await db
      .update(schema.vacancies)
      .set({ roleNodeId: roleId })
      .where(eq(schema.vacancies.id, vacancyId));

    const res = await coverage.lookup("https://jobs.dou.ua/companies/acme/vacancies/350774/");

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].verdict).toBe("found");
    expect(res.rows[0].match?.ingestLagMinutes).toBe(45);
    expect(res.rows[0].match?.legacyExternalIdForm).toBe(false);
    expect(res.summary).toMatchObject({ total: 1, found: 1, checked: 1, coveragePct: 100 });
  });

  it("matches a legacy Djinni row whose external_id is the full URL", async () => {
    const { sourceId, ingestId } = await seedSource("djinni");
    const roleId = await seedVerifiedRole("Blockchain Developer");
    const link = "https://djinni.co/jobs/821163-blockchain-developer/";
    const { vacancyId } = await seedVacancy({
      sourceId,
      ingestId,
      externalId: link, // pre-57d42ea form
      title: "Blockchain Developer",
      link,
      publishedAt: new Date("2026-08-20T10:00:00Z"),
    });
    await db
      .update(schema.vacancies)
      .set({ roleNodeId: roleId })
      .where(eq(schema.vacancies.id, vacancyId));

    const res = await coverage.lookup(link);

    expect(res.rows[0].verdict).toBe("found");
    expect(res.rows[0].match?.legacyExternalIdForm).toBe(true);
  });

  it("reports seen_but_not_loaded when RSS has the record but no vacancy exists", async () => {
    const { sourceId, ingestId } = await seedSource("dou");
    await seedRecord({
      sourceId,
      ingestId,
      externalId: "999111",
      title: "Orphaned record",
      link: "https://jobs.dou.ua/companies/acme/vacancies/999111/",
      publishedAt: new Date("2026-08-20T10:00:00Z"),
    });

    const res = await coverage.lookup("https://jobs.dou.ua/companies/acme/vacancies/999111/");

    expect(res.rows[0].verdict).toBe("seen_but_not_loaded");
    expect(res.rows[0].recordPath).toMatch(/^\/dashboard\/records\//);
    expect(res.sourceHealth).toHaveLength(1);
    expect(res.sourceHealth[0]).toMatchObject({ sourceCode: "dou", lastIngestStatus: "completed" });
  });

  it("returns not_found with source health context when nothing matches at all", async () => {
    await seedSource("dou");

    const res = await coverage.lookup("https://jobs.dou.ua/companies/acme/vacancies/1/");

    expect(res.rows[0].verdict).toBe("not_found");
    expect(res.sourceHealth[0].sourceCode).toBe("dou");
  });

  it("flags a position whose role is not VERIFIED as found_not_visible", async () => {
    const { sourceId, ingestId } = await seedSource("dou");
    await seedVacancy({
      sourceId,
      ingestId,
      externalId: "111222",
      title: "Mystery Role Job",
      link: "https://jobs.dou.ua/companies/acme/vacancies/111222/",
      publishedAt: new Date("2026-08-20T10:00:00Z"),
    });
    // no VERIFIED role assigned -> ineligible for public surfaces

    const res = await coverage.lookup("https://jobs.dou.ua/companies/acme/vacancies/111222/");

    expect(res.rows[0].verdict).toBe("found_not_visible");
    expect(res.rows[0].match).not.toBeNull();
  });

  it("names an unsupported host without touching the database", async () => {
    const res = await coverage.lookup("https://www.linkedin.com/jobs/view/4012345678/");

    expect(res.rows[0]).toMatchObject({ verdict: "source_not_supported", sourceCode: null });
    expect(res.summary).toMatchObject({ total: 1, checked: 0, coveragePct: null });
  });

  it("resolves our own vacancy URL straight to its posting", async () => {
    const { sourceId, ingestId } = await seedSource("dou");
    const { vacancyId } = await seedVacancy({
      sourceId,
      ingestId,
      externalId: "350774",
      title: "Senior Backend Engineer",
      link: "https://jobs.dou.ua/companies/acme/vacancies/350774/",
      publishedAt: new Date("2026-08-20T10:00:00Z"),
    });

    const res = await coverage.lookup(`https://metahunt.app/vacancy/senior-backend-${vacancyId}`);

    expect(res.rows[0].verdict).toBe("found_not_visible"); // no VERIFIED role in this fixture
    expect(res.rows[0].match?.postingId).toBe(vacancyId);
  });

  it("computes coverage percentage and median lag across a mixed batch", async () => {
    const { sourceId, ingestId } = await seedSource("dou");
    const roleId = await seedVerifiedRole("Backend Engineer");

    for (const [externalId, minutesLag] of [
      ["201", 10],
      ["202", 30],
      ["203", 90],
    ] as const) {
      const publishedAt = new Date("2026-08-20T10:00:00Z");
      const loadedAt = new Date(publishedAt.getTime() + minutesLag * 60_000);
      const { vacancyId } = await seedVacancy({
        sourceId,
        ingestId,
        externalId,
        title: `Job ${externalId}`,
        link: `https://jobs.dou.ua/companies/acme/vacancies/${externalId}/`,
        publishedAt,
        loadedAt,
      });
      await db
        .update(schema.vacancies)
        .set({ roleNodeId: roleId })
        .where(eq(schema.vacancies.id, vacancyId));
    }

    const input = [
      "https://jobs.dou.ua/companies/acme/vacancies/201/",
      "https://jobs.dou.ua/companies/acme/vacancies/202/",
      "https://jobs.dou.ua/companies/acme/vacancies/203/",
      "https://jobs.dou.ua/companies/acme/vacancies/404/", // not_found
    ].join("\n");

    const res = await coverage.lookup(input);

    expect(res.summary.total).toBe(4);
    expect(res.summary.checked).toBe(4);
    expect(res.summary.found).toBe(3);
    expect(res.summary.coveragePct).toBe(75);
    expect(res.summary.medianLagMinutes).toBe(30);
  });
});
