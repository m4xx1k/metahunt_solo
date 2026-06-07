import { count } from "drizzle-orm";
import { schema, type DrizzleDB } from "@metahunt/database";
import type { Pool } from "pg";

import type { ExtractedCandidate } from "../../src/baml_client";
import { FeedService } from "../../src/03-discovery/feed/feed.service";
import { RankingService } from "../../src/03-discovery/ranking/ranking.service";
import { CandidateLoaderService } from "../../src/03-discovery/cv/candidate-loader.service";
import type { CandidateExtractorPort } from "../../src/03-discovery/cv/candidate-extractor.port";
import { makeTestDb, truncateAll } from "./db";

let db: DrizzleDB;
let pool: Pool;

// Real loader + real RankingService against the live db; only the LLM extractor
// is stubbed — its return is the dial each test sets (TESTING.md: mock the seam).
function buildLoader(
  extract: (text: string) => Promise<ExtractedCandidate>,
): { loader: CandidateLoaderService; extract: jest.Mock } {
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

async function rowCount(
  table: typeof schema.nodes | typeof schema.candidates,
): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(table);
  return n;
}

async function seedSkill(name: string): Promise<void> {
  await db
    .insert(schema.nodes)
    .values({ type: "SKILL", canonicalName: name, status: "VERIFIED" });
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

describe("CandidateLoaderService.loadFromText (integration)", () => {
  it("stores the candidate with resolved skill links and keeps unknown skills as strings", async () => {
    await seedSkill("Go");
    const { loader } = buildLoader(async () =>
      extracted({ skills: { required: ["Go"], optional: ["NoSuchSkill"] } }),
    );

    const res = await loader.loadFromText("my cv text");

    expect(res.reused).toBe(false);
    expect(res.role).toBe("Backend Developer");
    expect(res.matched.map((m) => m.name)).toEqual(["Go"]);
    expect(res.unmatched).toEqual(["NoSuchSkill"]);
    expect(await rowCount(schema.candidates)).toBe(1);
    const links = await db.select().from(schema.candidateNodes);
    expect(links).toHaveLength(1);
  });

  it("is idempotent on the same CV text: reuses the row and skips the extractor", async () => {
    await seedSkill("Go");
    const { loader, extract } = buildLoader(async () =>
      extracted({ skills: { required: ["Go"], optional: [] } }),
    );

    const first = await loader.loadFromText("same cv");
    const second = await loader.loadFromText("same cv");

    expect(second.reused).toBe(true);
    expect(second.candidateId).toBe(first.candidateId);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(await rowCount(schema.candidates)).toBe(1);
  });

  it("dedupes whitespace/case variants of the same CV to one candidate", async () => {
    const { loader, extract } = buildLoader(async () =>
      extracted({ skills: { required: [], optional: [] } }),
    );

    const first = await loader.loadFromText("My  CV  Text");
    const second = await loader.loadFromText("my cv text");

    expect(second.candidateId).toBe(first.candidateId);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(await rowCount(schema.candidates)).toBe(1);
  });

  it("never creates a node for an unknown skill (resolve-only)", async () => {
    const { loader } = buildLoader(async () =>
      extracted({ skills: { required: ["TotallyUnknownSkill"], optional: [] } }),
    );

    const before = await rowCount(schema.nodes);
    const res = await loader.loadFromText("cv with a novel skill");

    expect(await rowCount(schema.nodes)).toBe(before);
    expect(res.matched).toHaveLength(0);
    expect(res.unmatched).toEqual(["TotallyUnknownSkill"]);
  });
});
