import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { makeTestDb, truncateAll } from "./db";
import { insertVacancyWithGroup, mergeIntoGroup } from "./vacancy-fixture";

// Proves the MET-138 read-model contract straight from the views, independent
// of any consumer: a repost collapses to one Position, canonical facts/links
// stay stable when the representative changes, and position_nodes preserves
// required/optional links regardless of the linked node's moderation status.
let db: DrizzleDB;
let pool: Pool;
let seq = 0;

async function seedSource(): Promise<{ sourceId: string; ingestId: string }> {
  const [source] = await db
    .insert(schema.sources)
    .values({ code: `src-${++seq}`, displayName: "Fixture", baseUrl: "https://example.test" })
    .returning({ id: schema.sources.id });
  const [ingest] = await db
    .insert(schema.rssIngests)
    .values({ sourceId: source.id, triggeredBy: "test", startedAt: new Date() })
    .returning({ id: schema.rssIngests.id });
  return { sourceId: source.id, ingestId: ingest.id };
}

async function seedVacancy(opts: {
  sourceId: string;
  ingestId: string;
  title: string;
  publishedAt: Date;
  seniority?: (typeof schema.seniority.enumValues)[number];
}): Promise<string> {
  const externalId = `ext-${++seq}`;
  const [rec] = await db
    .insert(schema.rssRecords)
    .values({
      sourceId: opts.sourceId,
      rssIngestId: opts.ingestId,
      externalId,
      hash: `hash-${externalId}`,
      title: opts.title,
      link: `https://example.test/${externalId}`,
      publishedAt: opts.publishedAt,
    })
    .returning({ id: schema.rssRecords.id });
  return insertVacancyWithGroup(db, {
    sourceId: opts.sourceId,
    externalId,
    lastRssRecordId: rec.id,
    title: opts.title,
    publishedAt: opts.publishedAt,
    seniority: opts.seniority,
  });
}

async function seedNode(
  type: (typeof schema.nodeType.enumValues)[number],
  status: (typeof schema.nodeStatus.enumValues)[number],
  name: string,
): Promise<string> {
  const [node] = await db
    .insert(schema.nodes)
    .values({ type, status, canonicalName: name })
    .returning({ id: schema.nodes.id });
  return node.id;
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

describe("Position read model (positions / postings / position_nodes)", () => {
  it("gives a singleton posting exactly one Position, canonical == representative", async () => {
    const { sourceId, ingestId } = await seedSource();
    const vacancyId = await seedVacancy({
      sourceId,
      ingestId,
      title: "Solo Backend Engineer",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const [posting] = await db
      .select()
      .from(schema.postings)
      .where(eq(schema.postings.postingId, vacancyId));
    expect(posting.positionId).not.toBeNull();

    const [position] = await db
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.positionId, posting.positionId as string));
    expect(position.canonicalPostingId).toBe(vacancyId);
    expect(position.representativePostingId).toBe(vacancyId);
    expect(position.title).toBe("Solo Backend Engineer");
    expect(position.postingCount).toBe(1);
    expect(position.sourceCount).toBe(1);
  });

  it("collapses a two-source repost to exactly one Position vote", async () => {
    const s1 = await seedSource();
    const s2 = await seedSource();
    const older = await seedVacancy({
      sourceId: s1.sourceId,
      ingestId: s1.ingestId,
      title: "Canonical Title",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
      seniority: "SENIOR",
    });
    const fresher = await seedVacancy({
      sourceId: s2.sourceId,
      ingestId: s2.ingestId,
      title: "Reposted Title",
      publishedAt: new Date("2026-01-10T00:00:00Z"),
      seniority: "SENIOR",
    });
    const groupId = await mergeIntoGroup(db, [older, fresher]);

    const rows = await db
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.positionId, groupId));
    expect(rows).toHaveLength(1);
    const [position] = rows;

    // Two Postings, one Position — the repost never adds a second vote.
    expect(position.postingCount).toBe(2);
    expect(position.sourceCount).toBe(2);

    // Facts come from the CANONICAL posting (the older, stickily-canonical
    // member), not the freshest one.
    expect(position.canonicalPostingId).toBe(older);
    expect(position.representativePostingId).toBe(fresher);
    expect(position.title).toBe("Canonical Title");
  });

  it("keeps canonical facts and links stable when the representative changes", async () => {
    const verifiedRequired = await seedNode("SKILL", "VERIFIED", "TypeScript");
    const verifiedOptional = await seedNode("SKILL", "VERIFIED", "GraphQL");
    const newRequired = await seedNode("SKILL", "NEW", "Bun");

    const s1 = await seedSource();
    const s2 = await seedSource();
    const s3 = await seedSource();
    const canonical = await seedVacancy({
      sourceId: s1.sourceId,
      ingestId: s1.ingestId,
      title: "Canonical Title",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
    });
    await db.insert(schema.vacancyNodes).values([
      { vacancyId: canonical, nodeId: verifiedRequired, isRequired: true },
      { vacancyId: canonical, nodeId: verifiedOptional, isRequired: false },
      { vacancyId: canonical, nodeId: newRequired, isRequired: true },
    ]);
    const repost1 = await seedVacancy({
      sourceId: s2.sourceId,
      ingestId: s2.ingestId,
      title: "Repost 1",
      publishedAt: new Date("2026-01-10T00:00:00Z"),
    });
    const groupId = await mergeIntoGroup(db, [canonical, repost1]);

    let position = (
      await db.select().from(schema.positions).where(eq(schema.positions.positionId, groupId))
    )[0];
    expect(position.canonicalPostingId).toBe(canonical);
    expect(position.representativePostingId).toBe(repost1);
    expect(position.title).toBe("Canonical Title");

    const linksBefore = await db
      .select({ nodeId: schema.positionNodes.nodeId, isRequired: schema.positionNodes.isRequired })
      .from(schema.positionNodes)
      .where(eq(schema.positionNodes.positionId, groupId));
    expect(linksBefore).toHaveLength(3);
    expect(new Set(linksBefore.map((l) => l.nodeId))).toEqual(
      new Set([verifiedRequired, verifiedOptional, newRequired]),
    );
    expect(linksBefore.find((l) => l.nodeId === verifiedOptional)?.isRequired).toBe(false);

    // A third, even fresher repost becomes the new representative. Canonical
    // stays `canonical` (it never left the group) — its facts and node links
    // must not move even though the representative pointer does.
    const repost2 = await seedVacancy({
      sourceId: s3.sourceId,
      ingestId: s3.ingestId,
      title: "Repost 2 — different title entirely",
      publishedAt: new Date("2026-02-01T00:00:00Z"),
    });
    await mergeIntoGroup(db, [canonical, repost2]);

    position = (
      await db.select().from(schema.positions).where(eq(schema.positions.positionId, groupId))
    )[0];
    expect(position.canonicalPostingId).toBe(canonical);
    expect(position.representativePostingId).toBe(repost2);
    expect(position.title).toBe("Canonical Title");
    expect(position.postingCount).toBe(3);

    const linksAfter = await db
      .select({ nodeId: schema.positionNodes.nodeId, isRequired: schema.positionNodes.isRequired })
      .from(schema.positionNodes)
      .where(eq(schema.positionNodes.positionId, groupId));
    expect(new Set(linksAfter.map((l) => l.nodeId))).toEqual(
      new Set(linksBefore.map((l) => l.nodeId)),
    );
  });

  it("exposes ELIGIBLE_POSITION-gated aggregates identically to a hand-rolled join", async () => {
    const roleVerified = await seedNode("ROLE", "VERIFIED", "Backend Engineer");
    const { sourceId, ingestId } = await seedSource();
    const eligible = await seedVacancy({
      sourceId,
      ingestId,
      title: "Eligible Position",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
    });
    await db
      .update(schema.vacancies)
      .set({ roleNodeId: roleVerified })
      .where(eq(schema.vacancies.id, eligible));
    // A position with no VERIFIED role must not count as eligible.
    await seedVacancy({
      sourceId,
      ingestId,
      title: "Roleless Position",
      publishedAt: new Date("2026-01-02T00:00:00Z"),
    });

    const rows = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count
      FROM positions p
      WHERE p.role_node_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM nodes rn WHERE rn.id = p.role_node_id AND rn.status = 'VERIFIED')
    `);
    expect(rows.rows[0].count).toBe("1");
  });
});
