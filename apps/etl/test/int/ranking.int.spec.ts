import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { FeedService } from "../../src/03-discovery/feed/feed.service";
import { CandidateLoaderService } from "../../src/03-discovery/cv/candidate-loader.service";
import { CandidateMatchService } from "../../src/03-discovery/cv/candidate-match.service";
import { RankingService } from "../../src/03-discovery/ranking/ranking.service";
import { NodeSlugResolver } from "../../src/platform/nodes/node-slug.resolver";

import { noopAnalytics } from "./analytics";
import { makeTestDb, truncateAll } from "./db";
import { insertVacancyWithGroup, mergeIntoGroup } from "./vacancy-fixture";

let db: DrizzleDB;
let pool: Pool;
let ranking: RankingService;
let candidateMatch: CandidateMatchService;
let seq = 0;

// ── factories ──────────────────────────────────────────────────────────────
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

async function seedNode(
  type: "ROLE" | "SKILL" | "DOMAIN",
  name: string,
  status: "NEW" | "VERIFIED" | "HIDDEN" = "VERIFIED",
): Promise<string> {
  const [n] = await db
    .insert(schema.nodes)
    .values({ type, canonicalName: name, status })
    .returning({ id: schema.nodes.id });
  return n.id;
}

async function seedVacancy(
  sourceId: string,
  ingestId: string,
  roleNodeId: string | null,
  title = "Some Role",
): Promise<string> {
  const externalId = `ext-${++seq}`;
  const [rec] = await db
    .insert(schema.rssRecords)
    .values({
      sourceId,
      rssIngestId: ingestId,
      externalId,
      hash: `hash-${externalId}`,
      title,
      publishedAt: new Date(),
    })
    .returning({ id: schema.rssRecords.id });
  return insertVacancyWithGroup(db, {
    sourceId,
    externalId,
    lastRssRecordId: rec.id,
    title,
    roleNodeId,
  });
}

async function seedTechMeta(
  nodeId: string,
  meta: { category: "LANGUAGE" | "TOOL"; stack: string | null; isCore: boolean },
) {
  await db.insert(schema.nodeTechMeta).values({ nodeId, ...meta });
}

async function linkSkill(vacancyId: string, nodeId: string, isRequired = true) {
  await db.insert(schema.vacancyNodes).values({ vacancyId, nodeId, isRequired });
}

async function refreshNodeStats() {
  await db.execute(sql`REFRESH MATERIALIZED VIEW node_stats`);
}

async function seedCandidate(skillIds: string[]): Promise<string> {
  const [candidate] = await db
    .insert(schema.candidates)
    .values({
      contentHash: `candidate-${++seq}`,
      sourceText: "",
      extracted: { unmatchedSkills: [] },
    })
    .returning({ id: schema.candidates.id });
  await db
    .insert(schema.candidateNodes)
    .values(skillIds.map((nodeId) => ({ candidateId: candidate.id, nodeId })));
  return candidate.id;
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
  ranking = new RankingService(db, new FeedService(db), noopAnalytics(db));
  const candidates = new CandidateLoaderService(db, { extract: jest.fn() }, ranking);
  candidateMatch = new CandidateMatchService(candidates, ranking, new NodeSlugResolver(db));
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await truncateAll(db);
});

describe("RankingService.resolveSkills (integration)", () => {
  it("resolves canonical and alias names to the same node and reports misses", async () => {
    const react = await seedNode("SKILL", "React");
    await db.insert(schema.nodeAliases).values({ name: "react.js", type: "SKILL", nodeId: react });
    await seedNode("SKILL", "Secret", "HIDDEN");

    const res = await ranking.resolveSkills(["React", "react.js", "Nope", "Secret"]);

    expect(res.matched).toHaveLength(1); // React + react.js collapse to one node
    expect(res.matched[0].name).toBe("React");
    expect(res.unmatched).toEqual(expect.arrayContaining(["Nope", "Secret"]));
  });
});

describe("RankingService.match (integration)", () => {
  it("ranks a rare-skill match above a common-skill match", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedNode("ROLE", "Backend Developer");
    const rare = await seedNode("SKILL", "Ariadne");
    const common = await seedNode("SKILL", "Python");
    const vacRare = await seedVacancy(sourceId, ingestId, role, "Rare");
    const vacCommon = await seedVacancy(sourceId, ingestId, role, "Common");
    // common on both (high df → low weight), rare on one only (df=1 → high
    // weight). Smoothed IDF (ln(N/(df+5))) is only meaningful once N ≫ df+5, so
    // pad the corpus with skill-less filler vacancies — they inflate N (keeping
    // the rare skill's weight positive) without touching either df.
    for (let i = 0; i < 12; i++) {
      await seedVacancy(sourceId, ingestId, role, `Filler ${i}`);
    }
    await linkSkill(vacRare, rare);
    await linkSkill(vacRare, common);
    await linkSkill(vacCommon, common);
    await refreshNodeStats();

    const res = await ranking.match(["Ariadne", "Python"], {}, 1, 20);

    expect(res.total).toBe(2);
    expect(res.items[0].vacancy.id).toBe(vacRare);
    expect(res.items[0].relevance).toBeGreaterThan(res.items[1].relevance);
  });

  it("computes required-coverage fit and lists the unmatched required skill as missing", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedNode("ROLE", "Backend Developer");
    const go = await seedNode("SKILL", "Go");
    const k8s = await seedNode("SKILL", "Kubernetes");
    const vac = await seedVacancy(sourceId, ingestId, role);
    await linkSkill(vac, go, true);
    await linkSkill(vac, k8s, true);
    // Pad the corpus so smoothed IDF (ln(N/(df+5))) stays positive — otherwise
    // every weight clamps to 0 and weighted required-coverage can't compute
    // (see the rare-skill test above). Filler vacancies inflate N without
    // touching Go/Kubernetes df, so both keep an equal positive weight → 1/2.
    for (let i = 0; i < 12; i++) {
      await seedVacancy(sourceId, ingestId, role, `Filler ${i}`);
    }
    await refreshNodeStats();

    const res = await ranking.match(["Go"], {}, 1, 20);

    expect(res.items).toHaveLength(1);
    expect(res.items[0].fit).toMatchObject({
      matchedRequired: 1,
      requiredTotal: 2,
      tier: "GOOD", // 1/2 coverage
      percent: 50, // the tier's own source number, now on the wire
    });
    expect(res.items[0].breakdown.signals).toEqual([
      { kind: "skill-overlap", raw: 0.5, weight: 1, contribution: 0.5 },
    ]);
    expect(res.items[0].diff.have.map((s) => s.name)).toEqual(["Go"]);
    expect(res.items[0].diff.missing.map((s) => s.name)).toEqual(["Kubernetes"]);
  });

  it("sorts by posting date without changing the result set or the scores", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedNode("ROLE", "Backend Developer");
    const rare = await seedNode("SKILL", "Ariadne");
    const common = await seedNode("SKILL", "Python");
    // Best fit is the OLDEST posting, so score order and date order disagree.
    const vacRare = await seedVacancy(sourceId, ingestId, role, "Rare");
    const vacCommon = await seedVacancy(sourceId, ingestId, role, "Common");
    for (let i = 0; i < 12; i++) {
      await seedVacancy(sourceId, ingestId, role, `Filler ${i}`);
    }
    await linkSkill(vacRare, rare);
    await linkSkill(vacRare, common);
    await linkSkill(vacCommon, common);
    await db
      .update(schema.vacancies)
      .set({ publishedAt: new Date("2020-01-01") })
      .where(eq(schema.vacancies.id, vacRare));
    await db
      .update(schema.vacancies)
      .set({ publishedAt: new Date("2024-01-01") })
      .where(eq(schema.vacancies.id, vacCommon));
    await refreshNodeStats();

    const byScore = await ranking.match(["Ariadne", "Python"], { sort: "score" }, 1, 20);
    const byDate = await ranking.match(["Ariadne", "Python"], { sort: "date" }, 1, 20);

    expect(byScore.items.map((i) => i.vacancy.id)).toEqual([vacRare, vacCommon]);
    expect(byDate.items.map((i) => i.vacancy.id)).toEqual([vacCommon, vacRare]);
    expect(byDate.total).toBe(byScore.total);
    // Same scores on both pages — only the order moved.
    expect(new Map(byDate.items.map((i) => [i.vacancy.id, i.fit.percent]))).toEqual(
      new Map(byScore.items.map((i) => [i.vacancy.id, i.fit.percent])),
    );
  });

  // The bug this filter replaces: on_stack led the ORDER BY, so a weak in-stack
  // card outranked a strong off-stack one and the order contradicted the Fit %.
  it("hides off-stack vacancies by default and reports how many it hid", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedNode("ROLE", "Backend Developer");
    const node = await seedNode("SKILL", "Node.js");
    const python = await seedNode("SKILL", "Python");
    const docker = await seedNode("SKILL", "Docker");
    const k8s = await seedNode("SKILL", "Kubernetes");
    const terraform = await seedNode("SKILL", "Terraform");
    const ansible = await seedNode("SKILL", "Ansible");
    await seedTechMeta(node, { category: "LANGUAGE", stack: "node", isCore: true });
    await seedTechMeta(python, { category: "LANGUAGE", stack: "python", isCore: true });
    await seedTechMeta(docker, { category: "TOOL", stack: null, isCore: false });

    // In-stack but a weak fit (1 of 4 required); off-stack but a better one
    // (1 of 2) — the exact shape the old on_stack-first ORDER BY got wrong.
    const inStack = await seedVacancy(sourceId, ingestId, role, "In stack");
    const offStack = await seedVacancy(sourceId, ingestId, role, "Off stack");
    await linkSkill(inStack, node);
    await linkSkill(inStack, k8s);
    await linkSkill(inStack, terraform);
    await linkSkill(inStack, ansible);
    await linkSkill(offStack, docker);
    for (let i = 0; i < 12; i++) {
      await seedVacancy(sourceId, ingestId, role, `Filler ${i}`);
    }
    await linkSkill(offStack, python);
    await refreshNodeStats();
    const candidateId = await seedCandidate([node, docker]);

    const hidden = await candidateMatch.match(candidateId, {}, 1, 20);
    const shown = await candidateMatch.match(candidateId, { includeOffStack: true }, 1, 20);

    expect(hidden.items.map((i) => i.vacancy.id)).toEqual([inStack]);
    expect(hidden.total).toBe(1);
    expect(hidden.offStackHidden).toBe(1);
    // Unhidden, the better fit leads — on_stack no longer sits in the ORDER BY.
    expect(shown.items.map((i) => i.vacancy.id)).toEqual([offStack, inStack]);
    expect(shown.items[0].fit.percent).toBeGreaterThan(shown.items[1].fit.percent);
    expect(shown.offStackHidden).toBe(0);
  });

  it("scores one canonical Position even when its representative repost has different skills", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedNode("ROLE", "Backend Developer");
    const node = await seedNode("SKILL", "Node.js");
    const python = await seedNode("SKILL", "Python");
    const docker = await seedNode("SKILL", "Docker");
    const k8s = await seedNode("SKILL", "Kubernetes");
    const terraform = await seedNode("SKILL", "Terraform");
    const ansible = await seedNode("SKILL", "Ansible");
    await seedTechMeta(node, { category: "LANGUAGE", stack: "node", isCore: true });
    await seedTechMeta(python, { category: "LANGUAGE", stack: "python", isCore: true });
    await seedTechMeta(docker, { category: "TOOL", stack: null, isCore: false });

    // Canonical facts and skills belong to the first member. The fresher repost
    // has divergent tags, but Position-grain scoring must not turn it into a
    // separate better off-stack result.
    const inStack = await seedVacancy(sourceId, ingestId, role, "In stack");
    const offStack = await seedVacancy(sourceId, ingestId, role, "Off stack");
    await linkSkill(inStack, node);
    await linkSkill(inStack, k8s);
    await linkSkill(inStack, terraform);
    await linkSkill(inStack, ansible);
    await linkSkill(offStack, docker);
    await linkSkill(offStack, python);
    for (let i = 0; i < 12; i++) {
      await seedVacancy(sourceId, ingestId, role, `Filler ${i}`);
    }
    await refreshNodeStats();
    const candidateId = await seedCandidate([node, docker]);

    await mergeIntoGroup(db, [inStack, offStack]);

    const res = await candidateMatch.match(candidateId, {}, 1, 20);

    expect(res.items.map((i) => i.vacancy.id)).toEqual([offStack]);
    expect(res.total).toBe(1);
    expect(res.offStackHidden).toBe(0);
    expect(res.items[0].onStack).toBe(true);
    expect(res.items[0].fit.percent).toBe(25);
    expect(res.items[0].diff.have.map((s) => s.name)).toEqual(["Node.js"]);
  });

  it("collapses a dedup group to a single ranked card", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedNode("ROLE", "Backend Developer");
    const skill = await seedNode("SKILL", "Python");
    const original = await seedVacancy(sourceId, ingestId, role, "Original");
    const repost = await seedVacancy(sourceId, ingestId, role, "Repost");
    await linkSkill(original, skill);
    await linkSkill(repost, skill);
    await refreshNodeStats();
    // Put both postings in one dedup group — the matcher must surface only one.
    await mergeIntoGroup(db, [original, repost]);

    const res = await ranking.match(["Python"], {}, 1, 20);

    expect(res.total).toBe(1);
    const fromGroup = res.items
      .map((i) => i.vacancy.id)
      .filter((id) => id === original || id === repost);
    expect(fromGroup).toHaveLength(1);
  });

  it("excludes a vacancy whose role is not VERIFIED", async () => {
    const { sourceId, ingestId } = await seedSource();
    const verified = await seedNode("ROLE", "Backend Developer", "VERIFIED");
    const unverified = await seedNode("ROLE", "Weird Role", "NEW");
    const skill = await seedNode("SKILL", "Python");
    const visible = await seedVacancy(sourceId, ingestId, verified, "Visible");
    const hidden = await seedVacancy(sourceId, ingestId, unverified, "Hidden");
    await linkSkill(visible, skill);
    await linkSkill(hidden, skill);
    await refreshNodeStats();

    const res = await ranking.match(["Python"], {}, 1, 20);

    const ids = res.items.map((i) => i.vacancy.id);
    expect(ids).toContain(visible);
    expect(ids).not.toContain(hidden);
  });
});

describe("CandidateMatchService criteria (integration)", () => {
  it("keeps role and excluded-skill criteria local to each match", async () => {
    const { sourceId, ingestId } = await seedSource();
    const backend = await seedNode("ROLE", "Backend Developer");
    const frontend = await seedNode("ROLE", "Frontend Developer");
    const typescript = await seedNode("SKILL", "TypeScript");
    const php = await seedNode("SKILL", "PHP");
    const backendVacancy = await seedVacancy(sourceId, ingestId, backend, "Backend");
    const frontendVacancy = await seedVacancy(sourceId, ingestId, frontend, "Frontend");
    await linkSkill(backendVacancy, typescript);
    await linkSkill(backendVacancy, php);
    await linkSkill(frontendVacancy, typescript);
    await refreshNodeStats();
    const candidateId = await seedCandidate([typescript]);

    const backendWithoutPhp = await candidateMatch.match(
      candidateId,
      { roleRefs: [backend], excludedSkillRefs: [php] },
      1,
      20,
    );
    const frontendResult = await candidateMatch.match(candidateId, { roleRefs: [frontend] }, 1, 20);
    const backendResult = await candidateMatch.match(candidateId, { roleRefs: [backend] }, 1, 20);

    expect(backendWithoutPhp.items).toHaveLength(0);
    expect(frontendResult.items.map((item) => item.vacancy.id)).toEqual([frontendVacancy]);
    expect(backendResult.items.map((item) => item.vacancy.id)).toEqual([backendVacancy]);
  });

  it("excludes required skills but allows the same optional skill", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedNode("ROLE", "Backend Developer");
    const typescript = await seedNode("SKILL", "TypeScript");
    const php = await seedNode("SKILL", "PHP");
    const requiredPhp = await seedVacancy(sourceId, ingestId, role, "Required PHP");
    const optionalPhp = await seedVacancy(sourceId, ingestId, role, "Optional PHP");
    await linkSkill(requiredPhp, typescript);
    await linkSkill(requiredPhp, php);
    await linkSkill(optionalPhp, typescript);
    await linkSkill(optionalPhp, php, false);
    await refreshNodeStats();
    const candidateId = await seedCandidate([typescript]);

    const result = await candidateMatch.match(candidateId, { excludedSkillRefs: [php] }, 1, 20);

    expect(result.items.map((item) => item.vacancy.id)).toEqual([optionalPhp]);
  });
});
