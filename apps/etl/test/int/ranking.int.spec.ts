import { inArray, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { FeedService } from "../../src/03-discovery/feed/feed.service";
import { CandidateLoaderService } from "../../src/03-discovery/cv/candidate-loader.service";
import { CandidateMatchService } from "../../src/03-discovery/cv/candidate-match.service";
import { RankingService } from "../../src/03-discovery/ranking/ranking.service";
import { NodeSlugResolver } from "../../src/platform/nodes/node-slug.resolver";

import { noopAnalytics } from "./analytics";
import { makeTestDb, truncateAll } from "./db";

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
  const [vac] = await db
    .insert(schema.vacancies)
    .values({ sourceId, externalId, lastRssRecordId: rec.id, title, roleNodeId })
    .returning({ id: schema.vacancies.id });
  return vac.id;
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
    });
    expect(res.items[0].diff.have.map((s) => s.name)).toEqual(["Go"]);
    expect(res.items[0].diff.missing.map((s) => s.name)).toEqual(["Kubernetes"]);
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
    const [group] = await db
      .insert(schema.uniqueVacancies)
      .values({
        canonicalVacancyId: original,
        sourceCount: 1,
        vacancyCount: 2,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      })
      .returning({ id: schema.uniqueVacancies.id });
    await db
      .update(schema.vacancies)
      .set({ uniqueVacancyId: group.id })
      .where(inArray(schema.vacancies.id, [original, repost]));

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
