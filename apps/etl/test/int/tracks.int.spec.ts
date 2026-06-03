import { sql } from "drizzle-orm";
import { schema, type DrizzleDB } from "@metahunt/database";
import type { Pool } from "pg";

import { TracksRepository } from "../../src/vacancies/tracks.repository";
import { VacanciesService } from "../../src/vacancies/vacancies.service";
import { resolveTrackPreset, presetMatchesNothing } from "../../src/vacancies/track-preset";
import { makeTestDb, truncateAll } from "./db";

// The headline invariant of the browse tree: a track's displayed count (from
// the track_counts view) must equal exactly what clicking it returns (the feed
// total). The count lives in SQL; the feed runs through resolveTrackPreset +
// the list query. This proves the two representations stay in lockstep — the
// regression the whole tracks refactor exists to make safe.

let db: DrizzleDB;
let pool: Pool;
let repo: TracksRepository;
let service: VacanciesService;

let seq = 0;
const PUBLISHED_AT = new Date("2026-04-24T10:00:00.000Z");

async function seedSource(): Promise<{ sourceId: string; ingestId: string }> {
  const [source] = await db
    .insert(schema.sources)
    .values({ code: "dou", displayName: "DOU", baseUrl: "https://dou.ua" })
    .returning({ id: schema.sources.id });
  const [ingest] = await db
    .insert(schema.rssIngests)
    .values({ sourceId: source.id, triggeredBy: "test", startedAt: new Date() })
    .returning({ id: schema.rssIngests.id });
  return { sourceId: source.id, ingestId: ingest.id };
}

async function makeNode(
  type: "ROLE" | "SKILL",
  canonicalName: string,
  status: "VERIFIED" | "NEW" = "VERIFIED",
): Promise<string> {
  const [node] = await db
    .insert(schema.nodes)
    .values({ type, canonicalName, status })
    .returning({ id: schema.nodes.id });
  return node.id;
}

async function makeVacancy(
  src: { sourceId: string; ingestId: string },
  roleNodeId: string,
  skillIds: string[],
): Promise<void> {
  const externalId = `vac-${(seq += 1)}`;
  const [record] = await db
    .insert(schema.rssRecords)
    .values({
      sourceId: src.sourceId,
      rssIngestId: src.ingestId,
      externalId,
      hash: `hash-${externalId}`,
      publishedAt: PUBLISHED_AT,
      title: externalId,
    })
    .returning({ id: schema.rssRecords.id });
  const [vacancy] = await db
    .insert(schema.vacancies)
    .values({
      sourceId: src.sourceId,
      externalId,
      lastRssRecordId: record.id,
      title: externalId,
      roleNodeId,
    })
    .returning({ id: schema.vacancies.id });
  if (skillIds.length > 0) {
    await db.insert(schema.vacancyNodes).values(
      skillIds.map((nodeId) => ({
        vacancyId: vacancy.id,
        nodeId,
        isRequired: true,
      })),
    );
  }
}

async function makeTrack(
  slug: string,
  label: string,
  nodeIds: string[],
  parentId: string | null = null,
  sortOrder = 0,
): Promise<string> {
  const [track] = await db
    .insert(schema.tracks)
    .values({ slug, label, parentId, sortOrder })
    .returning({ id: schema.tracks.id });
  if (nodeIds.length > 0) {
    await db
      .insert(schema.trackNodes)
      .values(nodeIds.map((nodeId) => ({ trackId: track.id, nodeId })));
  }
  return track.id;
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
  repo = new TracksRepository(db);
  service = new VacanciesService(db);
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await db.execute(sql`TRUNCATE TABLE tracks RESTART IDENTITY CASCADE`);
  await truncateAll(db);
});

describe("track count == click (integration)", () => {
  it("matches the view count to the feed total for every active track", async () => {
    const src = await seedSource();

    const backendRole = await makeNode("ROLE", "Backend Developer");
    const frontendRole = await makeNode("ROLE", "Frontend Developer");
    const unverifiedRole = await makeNode("ROLE", "Mystery Role", "NEW");
    const go = await makeNode("SKILL", "Go");
    const python = await makeNode("SKILL", "Python");
    const docker = await makeNode("SKILL", "Docker");

    await makeVacancy(src, backendRole, [go, docker]); // backend, backend-go
    await makeVacancy(src, backendRole, [go]); // backend, backend-go
    await makeVacancy(src, backendRole, [python]); // backend, backend-python
    await makeVacancy(src, backendRole, []); // backend (role only)
    await makeVacancy(src, frontendRole, [docker]); // frontend
    await makeVacancy(src, unverifiedRole, [go]); // ineligible — role not VERIFIED

    // backend discipline (ROLE) + two stack children (inherit role, own SKILL),
    // a sibling discipline, and a pure-grouping track with no nodes.
    const backend = await makeTrack("backend", "Backend", [backendRole], null, 1);
    await makeTrack("backend-go", "Go", [go], backend, 1);
    await makeTrack("backend-python", "Python", [python], backend, 2);
    await makeTrack("frontend", "Frontend", [frontendRole], null, 2);
    await makeTrack("by-language", "By Language", [], null, 3);

    const tree = await repo.findTrackTree();
    expect(tree.length).toBe(5);

    for (const track of tree) {
      const nodeIds = await repo.findTrackNodeIds(track.slug);
      expect(nodeIds).not.toBeNull();
      const preset = resolveTrackPreset(nodeIds!);

      // The feed the page runs: a grouping track (empty preset) shows nothing
      // without hitting the list; otherwise query by the resolved axes.
      const feedTotal = presetMatchesNothing(preset)
        ? 0
        : (
            await service.list({
              page: 1,
              pageSize: 1,
              roleIds: preset.roleIds.length > 0 ? preset.roleIds : undefined,
              skillIds: preset.skillIds.length > 0 ? preset.skillIds : undefined,
            })
          ).total;

      expect({ slug: track.slug, count: track.count }).toEqual({
        slug: track.slug,
        count: feedTotal,
      });
    }

    // Guard the fixture itself: the expected eligible counts.
    const bySlug = Object.fromEntries(tree.map((t) => [t.slug, t.count]));
    expect(bySlug).toEqual({
      backend: 4,
      "backend-go": 2,
      "backend-python": 1,
      frontend: 1,
      "by-language": 0,
    });
  });
});
