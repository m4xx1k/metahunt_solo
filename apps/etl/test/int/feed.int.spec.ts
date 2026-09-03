import { sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { FacetsService } from "../../src/03-discovery/feed/facets.service";
import { FeedService } from "../../src/03-discovery/feed/feed.service";
import { resolveFeedQuery } from "../../src/03-discovery/feed/resolve-feed-query";
import { resolveViewer, scorerForNodeIds } from "../../src/03-discovery/score/scorer.port";

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

// §7 step 3: the CHEAP PATH — a scorer attaches `match` to the page FeedService
// already chose; it must never change WHICH rows come back or `total`.
describe("FeedService.search — scorer / CHEAP PATH (integration)", () => {
  it("attaches match without moving total or the result set", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedRole();
    const [skill] = await db
      .insert(schema.nodes)
      .values({ type: "SKILL", canonicalName: "Go", status: "VERIFIED" })
      .returning({ id: schema.nodes.id });
    const matching = await seedVacancy({
      sourceId,
      ingestId,
      roleNodeId: role,
      publishedAt: new Date("2026-06-02T00:00:00Z"),
    });
    const nonMatching = await seedVacancy({
      sourceId,
      ingestId,
      roleNodeId: role,
      publishedAt: new Date("2026-06-01T00:00:00Z"),
    });
    await db.insert(schema.vacancyNodes).values({
      vacancyId: matching,
      nodeId: skill.id,
      isRequired: true,
    });
    // Filler so smoothed IDF (ln(N/(df+5))) stays positive — same note as
    // score.int.spec.ts / ranking.int.spec.ts.
    for (let i = 0; i < 12; i++) {
      await seedVacancy({
        sourceId,
        ingestId,
        roleNodeId: role,
        publishedAt: new Date("2026-05-01T00:00:00Z"),
      });
    }
    await db.execute(sql`REFRESH MATERIALIZED VIEW node_stats`);
    const [candidate] = await db
      .insert(schema.candidates)
      .values({ contentHash: "cand-search-scorer", sourceText: "", extracted: {} })
      .returning({ id: schema.candidates.id });
    await db.insert(schema.candidateNodes).values({ candidateId: candidate.id, nodeId: skill.id });

    const params = { page: 1, pageSize: 20 };
    const unscored = await feed.search(params);
    const viewer = await resolveViewer(db, candidate.id);
    const scorer = viewer ? scorerForNodeIds(db, viewer.nodeIds) : null;
    const scored = await feed.search(params, scorer);

    expect(scored.total).toBe(unscored.total);
    expect(scored.items.map((i) => i.id)).toEqual(unscored.items.map((i) => i.id));
    expect(unscored.items.every((i) => i.match === null)).toBe(true);

    const matchingCard = scored.items.find((i) => i.id === matching)!;
    const nonMatchingCard = scored.items.find((i) => i.id === nonMatching)!;
    expect(matchingCard.match).toMatchObject({ tier: "STRONG", percent: 100 });
    expect(nonMatchingCard.match).toBeNull();
  });

  it("leaves every card's match null when no scorer is passed — same as before this migration", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedRole();
    await seedVacancy({ sourceId, ingestId, roleNodeId: role, publishedAt: new Date() });

    const res = await feed.search({ page: 1, pageSize: 20 });

    expect(res.items.every((i) => i.match === null)).toBe(true);
  });

  // §6: the response carries the scored viewer's own resolved skills once per
  // page, so the cold card can compute ✅/❌/➕ counts client-side — null when
  // there is no candidate, mirroring `match`.
  it("ships viewerSkills for a resolved candidate and null otherwise", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedRole();
    await seedVacancy({ sourceId, ingestId, roleNodeId: role, publishedAt: new Date() });
    const [skill] = await db
      .insert(schema.nodes)
      .values({ type: "SKILL", canonicalName: "Rust", status: "VERIFIED" })
      .returning({ id: schema.nodes.id, canonicalName: schema.nodes.canonicalName });
    const [candidate] = await db
      .insert(schema.candidates)
      .values({ contentHash: "cand-viewer-skills", sourceText: "", extracted: {} })
      .returning({ id: schema.candidates.id });
    await db.insert(schema.candidateNodes).values({ candidateId: candidate.id, nodeId: skill.id });

    const params = { page: 1, pageSize: 20 };
    const anon = await resolveFeedQuery(db, null, params);
    expect(anon.viewerSkills).toBeNull();
    const anonRes = await feed.search(anon.filters, anon.scorer, anon.viewerSkills);
    expect(anonRes.viewerSkills).toBeNull();

    const scored = await resolveFeedQuery(db, candidate.id, params);
    expect(scored.viewerSkills).toEqual([{ id: skill.id, name: "Rust" }]);
    const res = await feed.search(scored.filters, scored.scorer, scored.viewerSkills);
    expect(res.viewerSkills).toEqual([{ id: skill.id, name: "Rust" }]);
  });
});

// §7 step 4: sort=score / minFitTier drive the FULL PATH (§2.2) through the
// same FeedService.search — the score decides the result set and/or order.
describe("FeedService.search — sort=score / FULL PATH (integration)", () => {
  async function seedCandidateWithSkills(skillIds: string[]): Promise<string> {
    const [candidate] = await db
      .insert(schema.candidates)
      .values({ contentHash: `cand-full-${skillIds.join("-")}`, sourceText: "", extracted: {} })
      .returning({ id: schema.candidates.id });
    if (skillIds.length > 0) {
      await db
        .insert(schema.candidateNodes)
        .values(skillIds.map((nodeId) => ({ candidateId: candidate.id, nodeId })));
    }
    return candidate.id;
  }

  it("orders best-fit-first, disagreeing with the date order the cheap path would give", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedRole();
    const [go, k8s] = await Promise.all([
      db
        .insert(schema.nodes)
        .values({ type: "SKILL", canonicalName: "Go", status: "VERIFIED" })
        .returning({ id: schema.nodes.id })
        .then((r) => r[0]),
      db
        .insert(schema.nodes)
        .values({ type: "SKILL", canonicalName: "Kubernetes", status: "VERIFIED" })
        .returning({ id: schema.nodes.id })
        .then((r) => r[0]),
    ]);
    // Both overlap (requireOverlap keeps both) — weakFit (1 of 2 required) is
    // NEWER, so date order puts it first; strongFit (2 of 2) is OLDER, so
    // only a real score-order pass puts it first instead.
    const weakFit = await seedVacancy({
      sourceId,
      ingestId,
      roleNodeId: role,
      publishedAt: new Date("2026-06-05T00:00:00Z"),
    });
    const strongFit = await seedVacancy({
      sourceId,
      ingestId,
      roleNodeId: role,
      publishedAt: new Date("2026-06-01T00:00:00Z"),
    });
    await db.insert(schema.vacancyNodes).values([
      { vacancyId: weakFit, nodeId: go.id, isRequired: true },
      { vacancyId: weakFit, nodeId: k8s.id, isRequired: true }, // matched
      { vacancyId: strongFit, nodeId: go.id, isRequired: true },
    ]);
    for (let i = 0; i < 12; i++) {
      await seedVacancy({
        sourceId,
        ingestId,
        roleNodeId: role,
        publishedAt: new Date("2026-05-01T00:00:00Z"),
      });
    }
    await db.execute(sql`REFRESH MATERIALIZED VIEW node_stats`);
    // Candidate has only `go` — weakFit: 1 of 2 required (GOOD); strongFit:
    // 1 of 1 required (STRONG). k8s on weakFit is the unmatched "❌".
    const candidateId = await seedCandidateWithSkills([go.id]);
    const viewer = await resolveViewer(db, candidateId);
    const scorer = viewer ? scorerForNodeIds(db, viewer.nodeIds) : null;

    // Cheap path (sort=date): unfiltered, so the 12 skill-less fillers ride
    // along too — assert relative order, not the exact list.
    const byDate = await feed.search({ page: 1, pageSize: 20, sort: "date" }, scorer);
    const byDateIds = byDate.items.map((i) => i.id);
    expect(byDateIds.indexOf(weakFit)).toBeLessThan(byDateIds.indexOf(strongFit));

    // Full path (sort=score): requireOverlap drops the zero-overlap fillers
    // entirely, so this list is exactly the two that share a skill.
    const byScore = await feed.search({ page: 1, pageSize: 20, sort: "score" }, scorer);
    expect(byScore.items.map((i) => i.id)).toEqual([strongFit, weakFit]);
    expect(byScore.total).toBe(2);
  });

  it("minFitTier forces the full path even with sort=date, and filters by tier", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedRole();
    const [go, k8s] = await Promise.all([
      db
        .insert(schema.nodes)
        .values({ type: "SKILL", canonicalName: "Go", status: "VERIFIED" })
        .returning({ id: schema.nodes.id })
        .then((r) => r[0]),
      db
        .insert(schema.nodes)
        .values({ type: "SKILL", canonicalName: "Kubernetes", status: "VERIFIED" })
        .returning({ id: schema.nodes.id })
        .then((r) => r[0]),
    ]);
    // 1 of 2 required (GOOD, below STRONG's 0.8).
    const goodFit = await seedVacancy({
      sourceId,
      ingestId,
      roleNodeId: role,
      publishedAt: new Date(),
    });
    await db.insert(schema.vacancyNodes).values([
      { vacancyId: goodFit, nodeId: go.id, isRequired: true },
      { vacancyId: goodFit, nodeId: k8s.id, isRequired: true },
    ]);
    for (let i = 0; i < 12; i++) {
      await seedVacancy({
        sourceId,
        ingestId,
        roleNodeId: role,
        publishedAt: new Date("2026-05-01T00:00:00Z"),
      });
    }
    await db.execute(sql`REFRESH MATERIALIZED VIEW node_stats`);
    const candidateId = await seedCandidateWithSkills([go.id]);
    const viewer = await resolveViewer(db, candidateId);
    const scorer = viewer ? scorerForNodeIds(db, viewer.nodeIds) : null;

    const good = await feed.search(
      { page: 1, pageSize: 20, sort: "date", minFitTier: "GOOD" },
      scorer,
    );
    const strong = await feed.search(
      { page: 1, pageSize: 20, sort: "date", minFitTier: "STRONG" },
      scorer,
    );

    expect(good.items.map((i) => i.id)).toEqual([goodFit]);
    expect(strong.items).toHaveLength(0);
  });

  it("hides off-stack by default and reports offStackHidden; includeOffStack unhides", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedRole();
    const [node, python, docker] = await Promise.all([
      db
        .insert(schema.nodes)
        .values({ type: "SKILL", canonicalName: "Node.js", status: "VERIFIED" })
        .returning({ id: schema.nodes.id })
        .then((r) => r[0]),
      db
        .insert(schema.nodes)
        .values({ type: "SKILL", canonicalName: "Python", status: "VERIFIED" })
        .returning({ id: schema.nodes.id })
        .then((r) => r[0]),
      db
        .insert(schema.nodes)
        .values({ type: "SKILL", canonicalName: "Docker", status: "VERIFIED" })
        .returning({ id: schema.nodes.id })
        .then((r) => r[0]),
    ]);
    await db.insert(schema.nodeTechMeta).values([
      { nodeId: node.id, category: "LANGUAGE", stack: "node", isCore: true },
      { nodeId: python.id, category: "LANGUAGE", stack: "python", isCore: true },
      { nodeId: docker.id, category: "TOOL", stack: null, isCore: false },
    ]);
    const inStack = await seedVacancy({
      sourceId,
      ingestId,
      roleNodeId: role,
      publishedAt: new Date(),
    });
    const offStack = await seedVacancy({
      sourceId,
      ingestId,
      roleNodeId: role,
      publishedAt: new Date(),
    });
    await db.insert(schema.vacancyNodes).values([
      { vacancyId: inStack, nodeId: node.id, isRequired: true },
      { vacancyId: offStack, nodeId: docker.id, isRequired: true },
      { vacancyId: offStack, nodeId: python.id, isRequired: true },
    ]);
    for (let i = 0; i < 12; i++) {
      await seedVacancy({
        sourceId,
        ingestId,
        roleNodeId: role,
        publishedAt: new Date("2026-05-01T00:00:00Z"),
      });
    }
    await db.execute(sql`REFRESH MATERIALIZED VIEW node_stats`);
    const candidateId = await seedCandidateWithSkills([node.id, docker.id]);
    const viewer = await resolveViewer(db, candidateId);
    const scorer = viewer ? scorerForNodeIds(db, viewer.nodeIds) : null;

    const hidden = await feed.search({ page: 1, pageSize: 20, sort: "score" }, scorer);
    const shown = await feed.search(
      { page: 1, pageSize: 20, sort: "score", includeOffStack: true },
      scorer,
    );

    expect(hidden.items.map((i) => i.id)).toEqual([inStack]);
    expect(hidden.offStackHidden).toBe(1);
    expect(shown.items.map((i) => i.id).sort()).toEqual([inStack, offStack].sort());
    expect(shown.offStackHidden).toBe(0);
  });

  it("falls back to the cheap path (ignores sort=score) when there is no scorer", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedRole();
    await seedVacancy({ sourceId, ingestId, roleNodeId: role, publishedAt: new Date() });

    const res = await feed.search({ page: 1, pageSize: 20, sort: "score" }, null);

    expect(res.items.every((i) => i.match === null)).toBe(true);
  });
});
