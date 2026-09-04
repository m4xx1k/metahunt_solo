import { sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { FeedService } from "../../src/03-discovery/feed/feed.service";
import { RankingService } from "../../src/03-discovery/ranking/ranking.service";
import {
  overlayFor,
  resolveActiveCandidateId,
  resolveSampleCandidateId,
  resolveViewer,
  scorerForNodeIds,
} from "../../src/03-discovery/score/scorer.port";

import { noopAnalytics } from "./analytics";
import { makeTestDb, truncateAll } from "./db";
import { insertVacancyWithGroup } from "./vacancy-fixture";

// The riskiest correctness claim in the unified feed/score plan (§7 step 1):
// overlayFor's CHEAP PATH — scopeIds narrows scoringCtes to a fixed id list —
// must produce the exact same relevance/coverage/tier/on_stack row as the
// FULL PATH (rankByRefs, unscoped) does for the same candidate + position.

let db: DrizzleDB;
let pool: Pool;
let ranking: RankingService;
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

async function seedNode(
  type: "ROLE" | "SKILL",
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

// positions.position_id is unique_vacancies.id (the dedup GROUP id), not the
// vacancy id insertVacancyWithGroup returns — position_nodes scopes on it.
async function positionIdOf(vacancyId: string): Promise<string> {
  const res = await db.execute<{ id: string }>(sql`
    SELECT id::text AS id FROM unique_vacancies WHERE canonical_vacancy_id = ${vacancyId}::uuid
  `);
  return res.rows[0].id;
}

// Corpus filler so smoothed IDF (ln(N/(df+5))) stays positive — see the same
// note in ranking.int.spec.ts.
async function seedFillers(sourceId: string, ingestId: string, role: string, n = 12) {
  for (let i = 0; i < n; i++) await seedVacancy(sourceId, ingestId, role, `Filler ${i}`);
}

async function seedCandidate(
  skillIds: string[],
  type: "user" | "sample" = "user",
): Promise<string> {
  const [candidate] = await db
    .insert(schema.candidates)
    .values({
      contentHash: `candidate-${++seq}`,
      sourceText: "",
      extracted: { unmatchedSkills: [] },
      type,
    })
    .returning({ id: schema.candidates.id });
  if (skillIds.length > 0) {
    await db
      .insert(schema.candidateNodes)
      .values(skillIds.map((nodeId) => ({ candidateId: candidate.id, nodeId })));
  }
  return candidate.id;
}

async function seedUser(): Promise<string> {
  const [user] = await db
    .insert(schema.users)
    .values({ source: "test" })
    .returning({ id: schema.users.id });
  return user.id;
}

async function linkActiveCv(userId: string, candidateId: string, isActive = true): Promise<void> {
  await db.insert(schema.userCvs).values({ userId, candidateId, label: "CV", isActive });
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
  ranking = new RankingService(db, new FeedService(db), noopAnalytics(db));
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await truncateAll(db);
});

describe("overlayFor vs the full path (integration)", () => {
  it("matches relevance, coverage, tier and percent for a partial required-skill fit", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedNode("ROLE", "Backend Developer");
    const go = await seedNode("SKILL", "Go");
    const k8s = await seedNode("SKILL", "Kubernetes");
    const vac = await seedVacancy(sourceId, ingestId, role);
    await linkSkill(vac, go, true);
    await linkSkill(vac, k8s, true);
    // A second, skill-less position in scope: scopeIds must narrow to it
    // without producing a spurious row (no position_nodes rows to aggregate).
    const filler = await seedVacancy(sourceId, ingestId, role, "No skills");
    await seedFillers(sourceId, ingestId, role);
    await refreshNodeStats();

    const full = await ranking.match(["Go"], {}, 1, 20);
    expect(full.items).toHaveLength(1);
    expect(full.items[0].vacancy.id).toBe(vac);

    const [vacPos, fillerPos] = await Promise.all([positionIdOf(vac), positionIdOf(filler)]);
    const overlay = await overlayFor(db, [go], [vacPos, fillerPos]);

    expect(overlay.has(fillerPos)).toBe(false);
    const got = overlay.get(vacPos);
    expect(got).toBeDefined();
    expect(got?.relevance).toBeCloseTo(full.items[0].relevance, 9);
    expect(got?.coverage).toBeCloseTo(full.items[0].breakdown.signals[0].raw, 9);
    expect(got?.tier).toBe(full.items[0].fit.tier);
    expect(got?.percent).toBe(full.items[0].fit.percent);
    expect(got?.onStack).toBe(full.items[0].onStack);
    // Coverage 1 of 2 required — pin the actual numbers, not just parity.
    expect(got).toMatchObject({ tier: "GOOD", percent: 50 });
  });

  it("matches on_stack for both an in-stack and an off-stack position", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedNode("ROLE", "Backend Developer");
    const node = await seedNode("SKILL", "Node.js");
    const python = await seedNode("SKILL", "Python");
    const docker = await seedNode("SKILL", "Docker");
    await seedTechMeta(node, { category: "LANGUAGE", stack: "node", isCore: true });
    await seedTechMeta(python, { category: "LANGUAGE", stack: "python", isCore: true });
    await seedTechMeta(docker, { category: "TOOL", stack: null, isCore: false });

    const inStack = await seedVacancy(sourceId, ingestId, role, "In stack");
    const offStack = await seedVacancy(sourceId, ingestId, role, "Off stack");
    await linkSkill(inStack, node);
    // Required docker gives offStack candidate overlap (else relevance is
    // NULL and rankByRefs drops the row before includeOffStack ever applies).
    await linkSkill(offStack, docker);
    await linkSkill(offStack, python);
    await seedFillers(sourceId, ingestId, role);
    await refreshNodeStats();

    // Candidate has both node (its stack) and docker — rankByRefs unscoped,
    // includeOffStack so both rows exist to compare against.
    const full = await ranking.rankByRefs(
      {
        matched: [
          { id: node, name: "Node.js", weight: 0 },
          { id: docker, name: "Docker", weight: 0 },
        ],
        unmatched: [],
      },
      { includeOffStack: true },
      1,
      20,
    );
    const fullById = new Map(full.items.map((i) => [i.vacancy.id, i]));
    expect(fullById.has(inStack)).toBe(true);
    expect(fullById.has(offStack)).toBe(true);

    const [inStackPos, offStackPos] = await Promise.all([
      positionIdOf(inStack),
      positionIdOf(offStack),
    ]);
    const overlay = await overlayFor(db, [node, docker], [inStackPos, offStackPos]);

    for (const [vacancyId, positionId] of [
      [inStack, inStackPos],
      [offStack, offStackPos],
    ] as const) {
      const got = overlay.get(positionId);
      const want = fullById.get(vacancyId)!;
      expect(got).toBeDefined();
      expect(got?.onStack).toBe(want.onStack);
      expect(got?.tier).toBe(want.fit.tier);
    }
    expect(overlay.get(inStackPos)?.onStack).toBe(true);
    expect(overlay.get(offStackPos)?.onStack).toBe(false);
  });
});

// §7 step 2: resolveActiveCandidateId (a userId's ACTIVE CV) composed with
// resolveViewer + overlayFor — the same two-call chain feed.controller.ts's
// withMatch() runs.
describe("resolveActiveCandidateId + resolveViewer + overlayFor (integration)", () => {
  it("scores against the user's active CV", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedNode("ROLE", "Backend Developer");
    const go = await seedNode("SKILL", "Go");
    const vac = await seedVacancy(sourceId, ingestId, role);
    await linkSkill(vac, go, true);
    await seedFillers(sourceId, ingestId, role);
    await refreshNodeStats();

    const candidateId = await seedCandidate([go]);
    const userId = await seedUser();
    await linkActiveCv(userId, candidateId);

    const vacPos = await positionIdOf(vac);
    const activeCandidateId = await resolveActiveCandidateId(db, userId);
    const viewer = activeCandidateId ? await resolveViewer(db, activeCandidateId) : null;
    const overlay = viewer ? await overlayFor(db, viewer.nodeIds, [vacPos]) : new Map();

    expect(overlay.get(vacPos)).toMatchObject({ tier: "STRONG", percent: 100 });
  });

  it("resolves no candidate for a user with no linked CV", async () => {
    const userId = await seedUser();

    await expect(resolveActiveCandidateId(db, userId)).resolves.toBeNull();
  });

  it("ignores a CV the user marked inactive", async () => {
    const go = await seedNode("SKILL", "Go");
    const candidateId = await seedCandidate([go]);
    const userId = await seedUser();
    await linkActiveCv(userId, candidateId, false);

    await expect(resolveActiveCandidateId(db, userId)).resolves.toBeNull();
  });
});

// §7 step 3: what resolveFeedQuery hands FeedService.search once a
// candidateId is resolved (JWT active CV, or an allowlisted ?sample=).
describe("resolveViewer + scorerForNodeIds (integration)", () => {
  it("scores through the bound CandidateScorer the same as calling overlayFor directly", async () => {
    const { sourceId, ingestId } = await seedSource();
    const role = await seedNode("ROLE", "Backend Developer");
    const go = await seedNode("SKILL", "Go");
    const vac = await seedVacancy(sourceId, ingestId, role);
    await linkSkill(vac, go, true);
    await seedFillers(sourceId, ingestId, role);
    await refreshNodeStats();
    const candidateId = await seedCandidate([go]);
    const vacPos = await positionIdOf(vac);

    const viewer = await resolveViewer(db, candidateId);
    const direct = await overlayFor(db, [go], [vacPos]);

    expect(viewer).not.toBeNull();
    const scorer = scorerForNodeIds(db, viewer!.nodeIds);
    await expect(scorer.overlayFor([vacPos])).resolves.toEqual(direct);
  });

  it("returns null for a candidate with no skill nodes at all", async () => {
    const candidateId = await seedCandidate([]);

    await expect(resolveViewer(db, candidateId)).resolves.toBeNull();
  });
});

describe("resolveSampleCandidateId (integration)", () => {
  it("resolves a seeded sample candidate's own id", async () => {
    const candidateId = await seedCandidate([], "sample");

    await expect(resolveSampleCandidateId(db, candidateId)).resolves.toBe(candidateId);
  });

  it("refuses a real (non-sample) candidate id — the §8 boundary this exists to hold", async () => {
    const candidateId = await seedCandidate([], "user");

    await expect(resolveSampleCandidateId(db, candidateId)).resolves.toBeNull();
  });

  it("refuses an id that matches no candidate at all", async () => {
    await expect(
      resolveSampleCandidateId(db, "00000000-0000-0000-0000-000000000000"),
    ).resolves.toBeNull();
  });
});

// §4 / §7 step 6: the candidate's own resolved skills (id + name), for the
// vacancy-detail diff's "➕ bonus" column — now `resolveViewer(candidateId)
// .skills`, off the same read `overlayFor`'s `nodeIds` come from.
describe("resolveViewer skills (integration)", () => {
  it("resolves the active CV's skills, id and name both", async () => {
    const go = await seedNode("SKILL", "Go");
    const k8s = await seedNode("SKILL", "Kubernetes");
    const candidateId = await seedCandidate([go, k8s]);
    const userId = await seedUser();
    await linkActiveCv(userId, candidateId);

    const activeCandidateId = await resolveActiveCandidateId(db, userId);
    const viewer = activeCandidateId ? await resolveViewer(db, activeCandidateId) : null;

    expect(viewer?.skills.map((s) => s.id).sort()).toEqual([go, k8s].sort());
    expect(viewer?.skills.find((s) => s.id === go)?.name).toBe("Go");
  });

  it("resolves no candidate for a user with no CV at all", async () => {
    const userId = await seedUser();

    await expect(resolveActiveCandidateId(db, userId)).resolves.toBeNull();
  });

  it("ignores a CV the user marked inactive", async () => {
    const go = await seedNode("SKILL", "Go");
    const candidateId = await seedCandidate([go]);
    const userId = await seedUser();
    await linkActiveCv(userId, candidateId, false);

    await expect(resolveActiveCandidateId(db, userId)).resolves.toBeNull();
  });
});
