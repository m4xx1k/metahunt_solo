import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { FacetsService } from "../../src/03-discovery/feed/facets.service";
import { FeedService } from "../../src/03-discovery/feed/feed.service";

import { makeTestDb, truncateAll } from "./db";
import { insertVacancyWithGroup, mergeIntoGroup } from "./vacancy-fixture";

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

async function seedCompany(name: string, slug: string): Promise<string> {
  const [c] = await db
    .insert(schema.companies)
    .values({ name, slug })
    .returning({ id: schema.companies.id });
  return c.id;
}

async function seedVacancy(opts: {
  sourceId: string;
  ingestId: string;
  roleNodeId: string | null;
  publishedAt: Date;
  companyId?: string;
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
  return insertVacancyWithGroup(db, {
    sourceId: opts.sourceId,
    externalId,
    lastRssRecordId: rec.id,
    title: "Backend Engineer",
    roleNodeId: opts.roleNodeId,
    companyId: opts.companyId,
    publishedAt: opts.publishedAt,
  });
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
    await mergeIntoGroup(db, [older, newer]);

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

  it("matches a Position on ANY member's source, but always displays its real representative", async () => {
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
    await mergeIntoGroup(db, [older, newer]);

    // MET-138: `sourceId` asks "does this Position have a Posting on s1?" —
    // it does, via `older`. The Position still surfaces once, and it still
    // shows its real (freshest) representative `newer`, never a filter-
    // scoped recomputation. Representative facts/link hydration are never
    // filter-dependent (IMPLEMENTATION.md — "Move public consumers").
    const res = await feed.search({ page: 1, pageSize: 50, sourceId: s1.sourceId });

    expect(res.items.map((i) => i.id)).toEqual([newer]);
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
    await mergeIntoGroup(db, [older, newer]);

    const res = await feed.search({ page: 1, pageSize: 50, hasDuplicates: true });

    expect(res.items.map((i) => i.id)).toEqual([newer]);
    expect(res.total).toBe(1);
  });
});

describe("FeedService.listForSitemap (integration)", () => {
  it("lists one URL per dedup group, not one per member", async () => {
    const s1 = await seedSource();
    const s2 = await seedSource();
    const role = await seedRole();
    const base = new Date(Date.now() - DAY);
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
      publishedAt: new Date(base.getTime() + DAY / 2),
    });
    await mergeIntoGroup(db, [older, newer]);

    const items = await feed.listForSitemap(30);

    // Publishing both members would be two URLs for one job — self-inflicted
    // duplicate content, which is the whole thing the sitemap must not do.
    expect(items.map((i) => i.id)).toEqual([newer]);
  });

  it("excludes vacancies outside the freshness window", async () => {
    const s = await seedSource();
    const role = await seedRole();
    const fresh = await seedVacancy({
      sourceId: s.sourceId,
      ingestId: s.ingestId,
      roleNodeId: role,
      publishedAt: new Date(Date.now() - 5 * DAY),
    });
    await seedVacancy({
      sourceId: s.sourceId,
      ingestId: s.ingestId,
      roleNodeId: role,
      publishedAt: new Date(Date.now() - 100 * DAY),
    });

    const items = await feed.listForSitemap(30);

    expect(items.map((i) => i.id)).toEqual([fresh]);
  });

  it("excludes vacancies the feed itself hides (no verified role)", async () => {
    const s = await seedSource();
    const role = await seedRole();
    const visible = await seedVacancy({
      sourceId: s.sourceId,
      ingestId: s.ingestId,
      roleNodeId: role,
      publishedAt: new Date(Date.now() - DAY),
    });
    await seedVacancy({
      sourceId: s.sourceId,
      ingestId: s.ingestId,
      roleNodeId: null,
      publishedAt: new Date(Date.now() - DAY),
    });

    const items = await feed.listForSitemap(30);

    expect(items.map((i) => i.id)).toEqual([visible]);
  });

  it("carries the title and timestamps a <url> entry needs", async () => {
    const s = await seedSource();
    const role = await seedRole();
    const published = new Date(Date.now() - 2 * DAY);
    await seedVacancy({
      sourceId: s.sourceId,
      ingestId: s.ingestId,
      roleNodeId: role,
      publishedAt: published,
    });

    const [item] = await feed.listForSitemap(30);

    expect(item.title).toBe("Backend Engineer");
    // The URL slug comes from the role, so the sitemap must carry it or it
    // would emit URLs that redirect to the ones the detail page builds.
    expect(item.roleName).toMatch(/^Backend Developer /);
    expect(item.publishedAt).toBe(published.toISOString());
    expect(new Date(item.updatedAt).getTime()).toBeGreaterThan(0);
  });
});

describe("company facet + filter (integration)", () => {
  it("counts a company's vacancies with dedup groups collapsed", async () => {
    const facets = new FacetsService(db);
    const s1 = await seedSource();
    const s2 = await seedSource();
    const role = await seedRole();
    const acme = await seedCompany("Acme", "acme");
    const base = new Date(Date.now() - DAY);
    const older = await seedVacancy({
      sourceId: s1.sourceId,
      ingestId: s1.ingestId,
      roleNodeId: role,
      publishedAt: base,
      companyId: acme,
    });
    const newer = await seedVacancy({
      sourceId: s2.sourceId,
      ingestId: s2.ingestId,
      roleNodeId: role,
      publishedAt: new Date(base.getTime() + DAY / 2),
      companyId: acme,
    });
    await mergeIntoGroup(db, [older, newer]);

    const { companies } = await facets.getCompanyFacets();

    // A repost across two boards is one opening, so the landing must say 1.
    expect(companies).toEqual([{ slug: "acme", name: "Acme", count: 1 }]);
  });

  it("resolves a slug to its id and returns null for an unknown one", async () => {
    const facets = new FacetsService(db);
    const acme = await seedCompany("Acme", "acme");

    await expect(facets.resolveCompanySlug("acme")).resolves.toBe(acme);
    await expect(facets.resolveCompanySlug("nope")).resolves.toBeNull();
  });

  it("filters the feed down to one company", async () => {
    const s = await seedSource();
    const role = await seedRole();
    const acme = await seedCompany("Acme", "acme");
    const other = await seedCompany("Other", "other");
    const mine = await seedVacancy({
      sourceId: s.sourceId,
      ingestId: s.ingestId,
      roleNodeId: role,
      publishedAt: new Date(Date.now() - DAY),
      companyId: acme,
    });
    await seedVacancy({
      sourceId: s.sourceId,
      ingestId: s.ingestId,
      roleNodeId: role,
      publishedAt: new Date(Date.now() - DAY),
      companyId: other,
    });

    const res = await feed.search({ page: 1, pageSize: 50, companyId: acme });

    expect(res.items.map((i) => i.id)).toEqual([mine]);
    expect(res.total).toBe(1);
  });
});

describe("FeedService.search — excluded skills (integration)", () => {
  it("hides required exclusions without hiding optional ones", async () => {
    const source = await seedSource();
    const role = await seedRole();
    const [skill] = await db
      .insert(schema.nodes)
      .values({ type: "SKILL", canonicalName: "PHP", status: "VERIFIED" })
      .returning({ id: schema.nodes.id });
    const required = await seedVacancy({
      sourceId: source.sourceId,
      ingestId: source.ingestId,
      roleNodeId: role,
      publishedAt: new Date(),
    });
    const optional = await seedVacancy({
      sourceId: source.sourceId,
      ingestId: source.ingestId,
      roleNodeId: role,
      publishedAt: new Date(),
    });
    await db.insert(schema.vacancyNodes).values([
      { vacancyId: required, nodeId: skill.id, isRequired: true },
      { vacancyId: optional, nodeId: skill.id, isRequired: false },
    ]);

    const result = await feed.search({
      page: 1,
      pageSize: 20,
      excludedSkillIds: [skill.id],
    });

    expect(result.items.map((item) => item.id)).toEqual([optional]);
  });
});
