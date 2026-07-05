import { sql } from "drizzle-orm";
import { schema, type DrizzleDB } from "@metahunt/database";
import type { Pool } from "pg";

import { DedupService } from "../../src/02-enrich/dedup/dedup.service";
import { OpenAIEmbeddingsClient } from "../../src/02-enrich/dedup/openai-embeddings.client";
import { makeTestDb, truncateAll } from "./db";

let db: DrizzleDB;
let pool: Pool;
let dedup: DedupService;
let seq = 0;

// resolveAll never calls OpenAI (only embedAll does); the resolve path reads
// only `.model` (a fallback in loadVacancyForResolve), so a stub suffices.
const embeddings = {
  model: "text-embedding-3-small",
  embed: async () => [],
} as unknown as OpenAIEmbeddingsClient;

// 1536-d embedding. Two vacancies on the same `axis` are cosine-identical
// (sim 1.0 → above the 0.92 gate); different axes are orthogonal (sim 0 → no
// match). Never all-zero — cosine distance is undefined for a zero vector.
const DIM = 1536;
function emb(axis: number): number[] {
  const v = new Array<number>(DIM).fill(0);
  v[axis % DIM] = 1;
  v[(axis + 1) % DIM] = 1;
  return v;
}

const DAY = 86_400_000;

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

async function seedVacancy(opts: {
  sourceId: string;
  ingestId: string;
  publishedAt: Date;
  embedding: number[];
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
    })
    .returning({ id: schema.rssRecords.id });
  const [vac] = await db
    .insert(schema.vacancies)
    .values({
      sourceId: opts.sourceId,
      externalId,
      lastRssRecordId: rec.id,
      title: "Backend Engineer",
      publishedAt: opts.publishedAt,
      embedding: opts.embedding,
      embeddingModel: "text-embedding-3-small",
    })
    .returning({ id: schema.vacancies.id });
  return vac.id;
}

async function groupCount(): Promise<number> {
  const r = await db.execute<{ c: string }>(
    sql`SELECT count(*)::text AS c FROM unique_vacancies`,
  );
  return Number(r.rows[0]?.c ?? 0);
}

async function groupIdOf(vacancyId: string): Promise<string | null> {
  const r = await db.execute<{ g: string | null }>(
    sql`SELECT unique_vacancy_id AS g FROM vacancies WHERE id = ${vacancyId}`,
  );
  return r.rows[0]?.g ?? null;
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
  dedup = new DedupService(db, embeddings);
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await truncateAll(db);
});

describe("DedupService.resolveAll — mechanics (integration)", () => {
  it("merges same-source reposts (a board re-listing one job under a new id)", async () => {
    const { sourceId, ingestId } = await seedSource();
    const base = new Date("2026-06-01T00:00:00Z");
    const a = await seedVacancy({ sourceId, ingestId, publishedAt: base, embedding: emb(3) });
    const b = await seedVacancy({
      sourceId,
      ingestId,
      publishedAt: new Date(base.getTime() + DAY),
      embedding: emb(3),
    });

    await dedup.resolveAll();

    expect(await groupCount()).toBe(1);
    expect(await groupIdOf(a)).toBe(await groupIdOf(b));
  });

  it("merges a cross-source pair 40 days apart (inside the 45d window)", async () => {
    const s1 = await seedSource();
    const s2 = await seedSource();
    const base = new Date("2026-05-01T00:00:00Z");
    const a = await seedVacancy({
      sourceId: s1.sourceId,
      ingestId: s1.ingestId,
      publishedAt: base,
      embedding: emb(7),
    });
    const b = await seedVacancy({
      sourceId: s2.sourceId,
      ingestId: s2.ingestId,
      publishedAt: new Date(base.getTime() + 40 * DAY),
      embedding: emb(7),
    });

    await dedup.resolveAll();

    expect(await groupCount()).toBe(1);
    expect(await groupIdOf(a)).toBe(await groupIdOf(b));
  });

  it("keeps a pair 46 days apart separate (outside the 45d window)", async () => {
    const s1 = await seedSource();
    const s2 = await seedSource();
    const base = new Date("2026-05-01T00:00:00Z");
    await seedVacancy({
      sourceId: s1.sourceId,
      ingestId: s1.ingestId,
      publishedAt: base,
      embedding: emb(9),
    });
    await seedVacancy({
      sourceId: s2.sourceId,
      ingestId: s2.ingestId,
      publishedAt: new Date(base.getTime() + 46 * DAY),
      embedding: emb(9),
    });

    await dedup.resolveAll();

    expect(await groupCount()).toBe(2);
  });
});
