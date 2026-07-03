import { sql } from "drizzle-orm";
import { schema, type DrizzleDB } from "@metahunt/database";
import type { Pool } from "pg";

import { FeedService } from "../../src/03-discovery/feed/feed.service";
import { RankingService } from "../../src/03-discovery/ranking/ranking.service";
import { makeTestDb, truncateAll } from "./db";

let db: DrizzleDB;
let pool: Pool;
let ranking: RankingService;
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

beforeAll(() => {
  ({ db, pool } = makeTestDb());
  ranking = new RankingService(db, new FeedService(db));
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
    await db
      .insert(schema.nodeAliases)
      .values({ name: "react.js", type: "SKILL", nodeId: react });
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
