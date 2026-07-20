import { count } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import type { CandidateExtractorPort } from "../../src/03-discovery/cv/candidate-extractor.port";
import { CandidateLoaderService } from "../../src/03-discovery/cv/candidate-loader.service";
import { FeedService } from "../../src/03-discovery/feed/feed.service";
import { RankingService } from "../../src/03-discovery/ranking/ranking.service";
import type { ExtractedCandidate } from "../../src/baml_client";

import { makeTestDb, truncateAll } from "./db";

let db: DrizzleDB;
let pool: Pool;

const OWNER_A = "00000000-0000-4000-8000-000000000001";
const OWNER_B = "00000000-0000-4000-8000-000000000002";

// Real loader + real RankingService against the live db; only the LLM extractor
// is stubbed — its return is the dial each test sets (TESTING.md: mock the seam).
function buildLoader(extract: (text: string) => Promise<ExtractedCandidate>): {
  loader: CandidateLoaderService;
  extract: jest.Mock;
} {
  const mock = jest.fn(extract);
  const extractor: CandidateExtractorPort = { extract: mock };
  const loader = new CandidateLoaderService(
    db,
    extractor,
    new RankingService(db, new FeedService(db)),
  );
  return { loader, extract: mock };
}

function extracted(overrides: Partial<ExtractedCandidate> = {}): ExtractedCandidate {
  return {
    role: "Backend Developer",
    seniority: "SENIOR",
    englishLevel: null,
    experienceYears: 3,
    skills: { required: [], optional: [] },
    ...overrides,
  } as ExtractedCandidate;
}

async function rowCount(table: typeof schema.nodes | typeof schema.candidates): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(table);
  return n;
}

async function seedSkill(name: string): Promise<void> {
  await db.insert(schema.nodes).values({ type: "SKILL", canonicalName: name, status: "VERIFIED" });
}

async function seedUser(id: string): Promise<void> {
  await db.insert(schema.users).values({ id, source: "test" }).onConflictDoNothing();
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await truncateAll(db);
});

describe("CandidateLoaderService.loadForUser (integration)", () => {
  it("stores the candidate with resolved skill links and keeps unknown skills as strings", async () => {
    await seedUser(OWNER_A);
    await seedSkill("Go");
    const { loader } = buildLoader(async () =>
      extracted({ skills: { required: ["Go"], optional: ["NoSuchSkill"] } }),
    );

    const res = await loader.loadForUser(OWNER_A, "my cv text");

    expect(res.reused).toBe(false);
    expect(res.role).toBe("Backend Developer");
    expect(res.matched.map((m) => m.name)).toEqual(["Go"]);
    expect(res.unmatched).toEqual(["NoSuchSkill"]);
    expect(await rowCount(schema.candidates)).toBe(1);
    const links = await db.select().from(schema.candidateNodes);
    expect(links).toHaveLength(1);
    const [candidate] = await db.select().from(schema.candidates);
    expect(candidate.sourceText).toBe("");
    expect(await db.select().from(schema.userCvs)).toHaveLength(1);
  });

  it("is idempotent for the same owner: reuses the row and skips the extractor", async () => {
    await seedUser(OWNER_A);
    await seedSkill("Go");
    const { loader, extract } = buildLoader(async () =>
      extracted({ skills: { required: ["Go"], optional: [] } }),
    );

    const first = await loader.loadForUser(OWNER_A, "same cv");
    const second = await loader.loadForUser(OWNER_A, "same cv");

    expect(second.reused).toBe(true);
    expect(second.candidateId).toBe(first.candidateId);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(await rowCount(schema.candidates)).toBe(1);
  });

  it("dedupes whitespace/case variants of the same CV to one candidate", async () => {
    await seedUser(OWNER_A);
    const { loader, extract } = buildLoader(async () =>
      extracted({ skills: { required: [], optional: [] } }),
    );

    const first = await loader.loadForUser(OWNER_A, "My  CV  Text");
    const second = await loader.loadForUser(OWNER_A, "my cv text");

    expect(second.candidateId).toBe(first.candidateId);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(await rowCount(schema.candidates)).toBe(1);
  });

  it("never creates a node for an unknown skill (resolve-only)", async () => {
    await seedUser(OWNER_A);
    const { loader } = buildLoader(async () =>
      extracted({ skills: { required: ["TotallyUnknownSkill"], optional: [] } }),
    );

    const before = await rowCount(schema.nodes);
    const res = await loader.loadForUser(OWNER_A, "cv with a novel skill");

    expect(await rowCount(schema.nodes)).toBe(before);
    expect(res.matched).toHaveLength(0);
    expect(res.unmatched).toEqual(["TotallyUnknownSkill"]);
  });

  it("does not share an identical CV or persist its raw text across users", async () => {
    await seedUser(OWNER_A);
    await seedUser(OWNER_B);
    const { loader, extract } = buildLoader(async () => extracted());

    const first = await loader.loadForUser(OWNER_A, "same private CV");
    const second = await loader.loadForUser(OWNER_B, "same private CV");

    expect(second.candidateId).not.toBe(first.candidateId);
    expect(extract).toHaveBeenCalledTimes(2);
    const candidates = await db.select().from(schema.candidates);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.sourceText)).toEqual(["", ""]);
    expect(new Set(candidates.map((candidate) => candidate.contentHash)).size).toBe(2);
  });
});
