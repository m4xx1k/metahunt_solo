import { inArray, sql } from "drizzle-orm";
import { schema, type DrizzleDB } from "@metahunt/database";
import type { Pool } from "pg";

import { FeedService } from "../../src/03-discovery/feed/feed.service";
import { makeTestDb, truncateAll } from "./db";

let db: DrizzleDB;
let pool: Pool;
let feed: FeedService;
let seq = 0;

async function seedSource(): Promise<{ sourceId: string; ingestId: string }> {
  const [source] = await db
    .insert(schema.sources)
    .values({ code: `src-${++seq}`, displayName: "DOU", baseUrl: "https://dou.ua" })
    .returning({ id: schema.sources.id });
  const [ingest] = await db
    .insert(schema.rssIngests)
    .values({ sourceId: source.id, triggeredBy: "test", startedAt: new Date() })
    .returning({ id: schema.rssIngests.id });
  return { sourceId: source.id, ingestId: ingest.id };
}

async function seedRole(): Promise<string> {
  const [n] = await db
    .insert(schema.nodes)
    .values({ type: "ROLE", canonicalName: `Backend Developer ${++seq}`, status: "VERIFIED" })
    .returning({ id: schema.nodes.id });
  return n.id;
}

async function seedVacancy(opts: {
  sourceId: string;
  ingestId: string;
  roleNodeId: string;
  publishedAt: Date;
}): Promise<string> {
  const externalId = `ext-${++seq}`;
  const [rec] = await db
    .insert(schema.rssRecords)
    .values({
      sourceId: opts.sourceId,
      rssIngestId: opts.ingestId,
      externalId,
      hash: `hash-${externalId}`,
      title: "Backend Engineer",
      publishedAt: opts.publishedAt,
      link: `https://dou.ua/${externalId}`,
    })
    .returning({ id: schema.rssRecords.id });
  const [vac] = await db
    .insert(schema.vacancies)
    .values({
      sourceId: opts.sourceId,
      externalId,
      lastRssRecordId: rec.id,
      title: "Backend Engineer",
      roleNodeId: opts.roleNodeId,
      publishedAt: opts.publishedAt,
    })
    .returning({ id: schema.vacancies.id });
  return vac.id;
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
  feed = new FeedService(db);
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await truncateAll(db);
});

const DAY = 86_400_000;

describe("FeedService.search — dedup collapse (integration)", () => {
  it("collapses a group to its freshest member and badges the group counts", async () => {
    const s1 = await seedSource();
    const s2 = await seedSource();
    const role = await seedRole();
    const base = new Date("2026-06-01T00:00:00Z");
    const older = await seedVacancy({
      sourceId: s1.sourceId,
      ingestId: s1.ingestId,
      roleNodeId: role,
      publishedAt: base,
    });
    const newer = await seedVacancy({
      sourceId: s2.sourceId,
      ingestId: s2.ingestId,
      roleNodeId: role,
      publishedAt: new Date(base.getTime() + DAY),
    });
    const singleton = await seedVacancy({
      sourceId: s1.sourceId,
      ingestId: s1.ingestId,
      roleNodeId: role,
      publishedAt: new Date(base.getTime() + 2 * DAY),
    });
    const [group] = await db
      .insert(schema.uniqueVacancies)
      .values({
        canonicalVacancyId: older,
        sourceCount: 2,
        vacancyCount: 2,
        firstSeenAt: base,
        lastSeenAt: new Date(base.getTime() + DAY),
      })
      .returning({ id: schema.uniqueVacancies.id });
    await db
      .update(schema.vacancies)
      .set({ uniqueVacancyId: group.id })
      .where(inArray(schema.vacancies.id, [older, newer]));

    const res = await feed.search({ page: 1, pageSize: 50 });

    const ids = res.items.map((i) => i.id);
    expect(ids).toContain(newer); // freshest group member survives
    expect(ids).not.toContain(older); // older member collapsed away
    expect(ids).toContain(singleton);
    expect(res.total).toBe(2); // group counts once + singleton

    const newerCard = res.items.find((i) => i.id === newer)!;
    expect(newerCard.duplicateCount).toBe(2);
    expect(newerCard.duplicateSourceCount).toBe(2);

    const singletonCard = res.items.find((i) => i.id === singleton)!;
    expect(singletonCard.duplicateCount).toBeNull();
  });

  it("keeps a filtered-in older member when the freshest member is filtered out", async () => {
    const s1 = await seedSource();
    const s2 = await seedSource();
    const role = await seedRole();
    const base = new Date("2026-06-01T00:00:00Z");
    const older = await seedVacancy({
      sourceId: s1.sourceId,
      ingestId: s1.ingestId,
      roleNodeId: role,
      publishedAt: base,
    });
    const newer = await seedVacancy({
      sourceId: s2.sourceId,
      ingestId: s2.ingestId,
      roleNodeId: role,
      publishedAt: new Date(base.getTime() + DAY),
    });
    const [group] = await db
      .insert(schema.uniqueVacancies)
      .values({
        canonicalVacancyId: older,
        sourceCount: 2,
        vacancyCount: 2,
        firstSeenAt: base,
        lastSeenAt: new Date(base.getTime() + DAY),
      })
      .returning({ id: schema.uniqueVacancies.id });
    await db
      .update(schema.vacancies)
      .set({ uniqueVacancyId: group.id })
      .where(inArray(schema.vacancies.id, [older, newer]));

    // Filter to the OLDER member's source; the freshest member (newer, on s2)
    // is filtered out. The collapse must fall back to the older member, not
    // drop the whole group.
    const res = await feed.search({ page: 1, pageSize: 50, sourceId: s1.sourceId });

    expect(res.items.map((i) => i.id)).toEqual([older]);
    expect(res.total).toBe(1);
  });

  it("returns only group representatives when hasDuplicates is set", async () => {
    const s1 = await seedSource();
    const s2 = await seedSource();
    const role = await seedRole();
    const base = new Date("2026-06-01T00:00:00Z");
    const older = await seedVacancy({
      sourceId: s1.sourceId,
      ingestId: s1.ingestId,
      roleNodeId: role,
      publishedAt: base,
    });
    const newer = await seedVacancy({
      sourceId: s2.sourceId,
      ingestId: s2.ingestId,
      roleNodeId: role,
      publishedAt: new Date(base.getTime() + DAY),
    });
    await seedVacancy({
      sourceId: s1.sourceId,
      ingestId: s1.ingestId,
      roleNodeId: role,
      publishedAt: new Date(base.getTime() + 2 * DAY),
    });
    const [group] = await db
      .insert(schema.uniqueVacancies)
      .values({
        canonicalVacancyId: older,
        sourceCount: 2,
        vacancyCount: 2,
        firstSeenAt: base,
        lastSeenAt: new Date(base.getTime() + DAY),
      })
      .returning({ id: schema.uniqueVacancies.id });
    await db
      .update(schema.vacancies)
      .set({ uniqueVacancyId: group.id })
      .where(inArray(schema.vacancies.id, [older, newer]));

    const res = await feed.search({ page: 1, pageSize: 50, hasDuplicates: true });

    expect(res.items.map((i) => i.id)).toEqual([newer]);
    expect(res.total).toBe(1);
  });
});
