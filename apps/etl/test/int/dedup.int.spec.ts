import { ConflictException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { DedupService } from "../../src/02-enrich/dedup/dedup.service";
import { OpenAIEmbeddingsClient } from "../../src/02-enrich/dedup/openai-embeddings.client";
import { diffPartitions } from "../../src/02-enrich/dedup/partition";
import * as partitionRepository from "../../src/02-enrich/dedup/partition.repository";
import { StalePartitionError } from "../../src/02-enrich/dedup/partition.repository";

import { makeTestDb, truncateAll } from "./db";
import { insertVacancyWithGroup } from "./vacancy-fixture";

let db: DrizzleDB;
let pool: Pool;
let dedup: DedupService;
let seq = 0;

// resolve/plan/apply never call OpenAI; only embedAll does.
const embeddings = {
  model: "text-embedding-3-small",
  embed: async () => [],
} as unknown as OpenAIEmbeddingsClient;

// Two vacancies on the same `axis` are cosine-identical, different axes are
// orthogonal. Never all-zero — cosine distance is undefined for a zero vector.
const DIM = 1536;
function emb(axis: number): number[] {
  const v = new Array<number>(DIM).fill(0);
  v[axis % DIM] = 1;
  v[(axis + 1) % DIM] = 1;
  return v;
}

function text(topic: string): string {
  return Array.from({ length: 60 }, (_, i) => `${topic}${i}`).join(" ");
}

const DAY = 86_400_000;
const BASE = new Date("2026-06-01T00:00:00Z");

async function seedSource(code: string): Promise<{ sourceId: string; ingestId: string }> {
  const [source] = await db
    .insert(schema.sources)
    .values({ code: `${code}-${++seq}`, displayName: code, baseUrl: `https://${code}.test` })
    .returning({ id: schema.sources.id });
  const [ingest] = await db
    .insert(schema.rssIngests)
    .values({ sourceId: source.id, triggeredBy: "test", startedAt: new Date() })
    .returning({ id: schema.rssIngests.id });
  return { sourceId: source.id, ingestId: ingest.id };
}

async function seedVacancy(
  src: { sourceId: string; ingestId: string },
  opts: {
    day?: number;
    embedding?: number[];
    fingerprint?: string;
    title?: string;
    description?: string;
  } = {},
): Promise<string> {
  const externalId = `ext-${++seq}`;
  const title = opts.title ?? "Backend Engineer";
  const publishedAt = new Date(BASE.getTime() + (opts.day ?? 0) * DAY);
  const [rec] = await db
    .insert(schema.rssRecords)
    .values({
      sourceId: src.sourceId,
      rssIngestId: src.ingestId,
      externalId,
      hash: `hash-${externalId}`,
      contentFingerprint: opts.fingerprint ?? `fp-${externalId}`,
      title,
      publishedAt,
    })
    .returning({ id: schema.rssRecords.id });
  return insertVacancyWithGroup(db, {
    sourceId: src.sourceId,
    externalId,
    lastRssRecordId: rec.id,
    title,
    description: opts.description ?? text(`t${seq}x`),
    publishedAt,
    embedding: opts.embedding ?? emb(seq * 3),
    embeddingModel: "text-embedding-3-small",
  });
}

async function groupCount(): Promise<number> {
  const r = await db.execute<{ c: string }>(sql`SELECT count(*)::text AS c FROM unique_vacancies`);
  return Number(r.rows[0]?.c ?? 0);
}

async function groupIdOf(vacancyId: string): Promise<string> {
  const r = await db.execute<{ g: string }>(
    sql`SELECT unique_vacancy_id AS g FROM vacancies WHERE id = ${vacancyId}`,
  );
  return r.rows[0].g;
}

async function partition(): Promise<Map<string, string>> {
  const r = await db.execute<{ id: string; g: string }>(
    sql`SELECT id, unique_vacancy_id AS g FROM vacancies`,
  );
  return new Map(r.rows.map((row) => [row.id, row.g]));
}

async function snapshot() {
  const r = await db.execute(sql`
    SELECT v.id, v.unique_vacancy_id, v.dedup_reason, v.deduplicated_at::text,
           u.canonical_vacancy_id
    FROM vacancies v JOIN unique_vacancies u ON u.id = v.unique_vacancy_id
    ORDER BY v.id
  `);
  return r.rows;
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

describe("DedupService.resolveAll — sweep (integration)", () => {
  it("merges same-source postings with identical content and is idempotent", async () => {
    const dou = await seedSource("dou");
    const a = await seedVacancy(dou, { fingerprint: "fp-same", embedding: emb(3) });
    const b = await seedVacancy(dou, { fingerprint: "fp-same", embedding: emb(3), day: 1 });

    await dedup.resolveAll();

    expect(await groupCount()).toBe(1);
    const groupId = await groupIdOf(a);
    expect(await groupIdOf(b)).toBe(groupId);
    const [group] = await db
      .select()
      .from(schema.uniqueVacancies)
      .where(sql`${schema.uniqueVacancies.id} = ${groupId}`);
    expect(group).toMatchObject({ vacancyCount: 2, sourceCount: 1, representativeVacancyId: b });
    const [member] = await db
      .select({ reason: schema.vacancies.dedupReason })
      .from(schema.vacancies)
      .where(sql`${schema.vacancies.id} = ${b}`);
    expect(member.reason).toMatchObject({ rule: "exact", matchedAgainstVacancyId: a });

    expect(await dedup.resolveAll()).toMatchObject({ processed: 0, resolved: 0 });
    expect(await groupCount()).toBe(1);
  });

  it("keeps same-source postings with different content apart even if embeddings match", async () => {
    const dou = await seedSource("dou");
    const a = await seedVacancy(dou, { embedding: emb(3), description: text("fintech") });
    const b = await seedVacancy(dou, { embedding: emb(3), description: text("health"), day: 1 });

    await dedup.resolveAll();

    expect(await groupIdOf(a)).not.toBe(await groupIdOf(b));
  });

  it("merges a cross-source pair 40 days apart, not 46", async () => {
    const dou = await seedSource("dou");
    const djinni = await seedSource("djinni");
    const shared = text("platform");
    const a = await seedVacancy(dou, { description: shared });
    const b = await seedVacancy(djinni, { description: shared, day: 40 });
    const c = await seedVacancy(djinni, { description: shared, title: "Data Engineer", day: 5 });
    const d = await seedVacancy(dou, { description: shared, title: "Data Engineer", day: 51 });

    await dedup.resolveAll();

    expect(await groupIdOf(a)).toBe(await groupIdOf(b));
    expect(await groupIdOf(c)).not.toBe(await groupIdOf(d));
  });

  it("never chains two different same-board postings through a cross-board match", async () => {
    const dou = await seedSource("dou");
    const djinni = await seedSource("djinni");
    const shared = text("chain");
    const a = await seedVacancy(dou, { description: `${shared} ${text("alpha")}` });
    const b = await seedVacancy(djinni, { description: shared, day: 1 });
    const c = await seedVacancy(dou, { description: `${shared} ${text("gamma")}`, day: 2 });

    await dedup.resolveAll();

    expect(await groupIdOf(a)).toBe(await groupIdOf(b));
    expect(await groupIdOf(c)).not.toBe(await groupIdOf(a));
  });

  it("splits an edited vacancy out of its group and keeps the old group id", async () => {
    const dou = await seedSource("dou");
    const djinni = await seedSource("djinni");
    const shared = text("edit");
    const a = await seedVacancy(dou, { description: shared });
    const b = await seedVacancy(djinni, { description: shared, day: 1 });
    await dedup.resolveAll();
    const groupId = await groupIdOf(a);
    expect(await groupIdOf(b)).toBe(groupId);

    const [rec] = await db
      .insert(schema.rssRecords)
      .values({
        sourceId: djinni.sourceId,
        rssIngestId: djinni.ingestId,
        externalId: `edited-${b}`,
        hash: `hash-edited-${b}`,
        contentFingerprint: "fp-edited",
        title: "Backend Engineer",
        publishedAt: BASE,
      })
      .returning({ id: schema.rssRecords.id });
    await db.execute(sql`
      UPDATE vacancies
      SET last_rss_record_id = ${rec.id},
          description = ${text("unrelated")},
          embedding = ${`[${emb(700).join(",")}]`}::vector,
          deduplicated_at = NULL,
          dedup_reason = NULL
      WHERE id = ${b}
    `);

    await dedup.resolveAll();

    expect(await groupIdOf(a)).toBe(groupId);
    expect(await groupIdOf(b)).not.toBe(groupId);
    expect(await groupCount()).toBe(2);
  });
});

describe("DedupService plan / apply / detach (integration)", () => {
  async function seedLinkedPair() {
    const dou = await seedSource("dou");
    const djinni = await seedSource("djinni");
    const shared = text("rebuild");
    const a = await seedVacancy(dou, { description: shared });
    const b = await seedVacancy(djinni, { description: shared, day: 1 });
    const c = await seedVacancy(dou, { title: "Designer", day: 2 });
    return { a, b, c };
  }

  it("apply writes the plan; a second plan is a 0 diff; current.json restores exactly", async () => {
    const { a, b } = await seedLinkedPair();
    const before = await partition();

    const first = await dedup.plan();
    expect(first.report.stats.diff.changedGroups).toBe(1);
    await dedup.apply(first.target);
    expect(await groupIdOf(a)).toBe(await groupIdOf(b));
    expect(await groupIdOf(a)).toBe(before.get(a));

    const second = await dedup.plan();
    expect(second.report.stats.diff).toEqual({ changedGroups: 0, splits: 0, merges: 0, moved: 0 });

    await dedup.apply(first.current);
    expect(await partition()).toEqual(before);
  });

  it("current.json restores reasons, the canonical member and exact timestamps", async () => {
    const { a, b } = await seedLinkedPair();
    await dedup.resolveAll();
    const groupId = await groupIdOf(a);
    await db.execute(sql`
      INSERT INTO dedup_overrides (vacancy_a, vacancy_b, verdict)
      VALUES (LEAST(${a}::uuid, ${b}::uuid), GREATEST(${a}::uuid, ${b}::uuid), 'different')
    `);
    const probe = await dedup.plan();
    const leaving = probe.target.entries.find(
      (e) => (e.vacancyId === a || e.vacancyId === b) && e.groupId !== groupId,
    )!.vacancyId;
    await db.execute(
      sql`UPDATE unique_vacancies SET canonical_vacancy_id = ${leaving} WHERE id = ${groupId}`,
    );
    await db.execute(
      sql`UPDATE vacancies SET deduplicated_at = '2026-09-01 10:00:00.123456+00' WHERE id = ${a}`,
    );
    const before = await snapshot();

    const plan = await dedup.plan();
    await dedup.apply(plan.target);
    expect(await snapshot()).not.toEqual(before);
    await dedup.apply(plan.current);

    expect(await snapshot()).toEqual(before);
  });

  it("refuses a plan when a vacancy changed or appeared after it was built", async () => {
    const { a } = await seedLinkedPair();
    const plan = await dedup.plan();

    await db.execute(sql`UPDATE vacancies SET embedding_source_hash = 'changed' WHERE id = ${a}`);
    await expect(dedup.apply(plan.target)).rejects.toThrow(StalePartitionError);

    const fresh = await dedup.plan();
    await seedVacancy(await seedSource("dou"));
    await expect(dedup.apply(fresh.target)).rejects.toThrow(StalePartitionError);
  });

  it("refuses a plan after a detach or a reclassification", async () => {
    const { a, b } = await seedLinkedPair();
    await dedup.resolveAll();
    const plan = await dedup.plan();
    await dedup.detach(await groupIdOf(a), b, null);
    await expect(dedup.apply(plan.target)).rejects.toThrow(StalePartitionError);

    const fresh = await dedup.plan();
    await db.execute(sql`UPDATE vacancies SET seniority = 'SENIOR' WHERE id = ${a}`);
    await expect(dedup.apply(fresh.target)).rejects.toThrow(StalePartitionError);
  });

  it("a detached member stays detached through a full plan/apply", async () => {
    const { a, b } = await seedLinkedPair();
    await dedup.resolveAll();
    const groupId = await groupIdOf(a);
    expect(await groupIdOf(b)).toBe(groupId);

    const out = await dedup.detach(groupId, b, null);

    expect(out.groupId).not.toBe(groupId);
    expect(await groupIdOf(a)).toBe(groupId);
    expect(await groupIdOf(b)).toBe(out.groupId);

    const plan = await dedup.plan();
    await dedup.apply(plan.target);
    expect(await groupIdOf(b)).not.toBe(await groupIdOf(a));
    const after = await dedup.plan();
    expect(
      diffPartitions(
        await partition(),
        new Map(after.target.entries.map((e) => [e.vacancyId, e.groupId])),
      ).changedGroups,
    ).toBe(0);
  });

  it("detach on a group that changed meanwhile is a 409 and keeps the override", async () => {
    const { a, b } = await seedLinkedPair();
    await dedup.resolveAll();
    const groupId = await groupIdOf(a);
    const realWrite = partitionRepository.writePartition;
    const write = jest
      .spyOn(partitionRepository, "writePartition")
      .mockImplementationOnce(async (tx, entries) => {
        await db.execute(
          sql`UPDATE vacancies SET embedding_source_hash = 'edited' WHERE id = ${a}`,
        );
        return realWrite(tx, entries);
      });

    const err = await dedup.detach(groupId, b, null).catch((e: unknown) => e);
    write.mockRestore();

    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getStatus()).toBe(409);
    const overrides = await db.execute<{ verdict: string }>(
      sql`SELECT verdict FROM dedup_overrides WHERE ${a} IN (vacancy_a, vacancy_b) AND ${b} IN (vacancy_a, vacancy_b)`,
    );
    expect(overrides.rows).toEqual([{ verdict: "different" }]);
    expect(await groupIdOf(b)).toBe(groupId);
  });

  it("detach rejects a vacancy outside the group", async () => {
    const { a, c } = await seedLinkedPair();
    await dedup.resolveAll();
    await expect(dedup.detach(await groupIdOf(a), c, null)).rejects.toThrow(/not a member/);
  });
});
