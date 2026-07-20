import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { RssBackfillService } from "../../src/01-ingest/rss/rss-backfill.service";
import { LoaderBackfillService } from "../../src/02-enrich/loader/services/loader-backfill.service";
import { MonitoringService } from "../../src/admin/monitoring/monitoring.service";

import { makeTestDb, truncateAll } from "./db";

let db: DrizzleDB;
let pool: Pool;

async function seedExtractionOutcomes(): Promise<{
  ingestId: string;
  pendingId: string;
  failedId: string;
  succeededId: string;
}> {
  const [source] = await db
    .insert(schema.sources)
    .values({
      code: "extraction-fixture",
      displayName: "Extraction fixture",
      baseUrl: "https://example.test",
    })
    .returning({ id: schema.sources.id });
  const [ingest] = await db
    .insert(schema.rssIngests)
    .values({
      sourceId: source.id,
      triggeredBy: "test",
      startedAt: new Date("2026-01-01T00:00:00Z"),
    })
    .returning({ id: schema.rssIngests.id });
  const extractedAt = new Date("2026-01-01T00:05:00Z");
  const rows = await db
    .insert(schema.rssRecords)
    .values([
      {
        sourceId: source.id,
        rssIngestId: ingest.id,
        externalId: "pending",
        hash: "pending",
        title: "Pending extraction",
        publishedAt: new Date("2026-01-01T00:01:00Z"),
      },
      {
        sourceId: source.id,
        rssIngestId: ingest.id,
        externalId: "failed",
        hash: "failed",
        title: "Failed extraction",
        publishedAt: new Date("2026-01-01T00:02:00Z"),
        extractedAt,
        extractedData: { _error: "rate limited" },
      },
      {
        sourceId: source.id,
        rssIngestId: ingest.id,
        externalId: "succeeded",
        hash: "succeeded",
        title: "Succeeded extraction",
        publishedAt: new Date("2026-01-01T00:03:00Z"),
        extractedAt,
        extractedData: { role: "Backend Engineer" },
      },
    ])
    .returning({ id: schema.rssRecords.id, externalId: schema.rssRecords.externalId });
  const byExternalId = new Map(rows.map((row) => [row.externalId, row.id]));

  return {
    ingestId: ingest.id,
    pendingId: byExternalId.get("pending")!,
    failedId: byExternalId.get("failed")!,
    succeededId: byExternalId.get("succeeded")!,
  };
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

describe("extraction outcome boundary (integration)", () => {
  it("retries pending and failed records, but only loads successful records", async () => {
    const { pendingId, failedId, succeededId } = await seedExtractionOutcomes();
    const extractAndInsert = jest.fn().mockResolvedValue(undefined);
    const loadFromRecord = jest.fn().mockResolvedValue("vacancy-id");
    const extractionBackfill = new RssBackfillService({ extractAndInsert } as never, db);
    const loaderBackfill = new LoaderBackfillService({ loadFromRecord } as never, db);

    await expect(extractionBackfill.extractMissing(10)).resolves.toEqual({
      attempted: 2,
      succeeded: 2,
      failed: 0,
    });
    expect(extractAndInsert.mock.calls.map(([id]) => id)).toEqual(
      expect.arrayContaining([pendingId, failedId]),
    );
    expect(extractAndInsert).not.toHaveBeenCalledWith(succeededId);

    await expect(loaderBackfill.loadMissing(10)).resolves.toEqual({
      attempted: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(loadFromRecord).toHaveBeenCalledWith(succeededId);
  });

  it("reports distinct outcome statuses and ingest counts", async () => {
    const { ingestId } = await seedExtractionOutcomes();
    const monitoring = new MonitoringService(db);

    await expect(
      monitoring.listRecords({ extractionStatus: "pending", limit: 10, offset: 0 }),
    ).resolves.toMatchObject({ items: [{ extractionStatus: "pending" }], total: 1 });
    await expect(
      monitoring.listRecords({ extractionStatus: "failed", limit: 10, offset: 0 }),
    ).resolves.toMatchObject({ items: [{ extractionStatus: "failed" }], total: 1 });
    await expect(
      monitoring.listRecords({ extractionStatus: "succeeded", limit: 10, offset: 0 }),
    ).resolves.toMatchObject({ items: [{ extractionStatus: "succeeded" }], total: 1 });

    await expect(monitoring.getIngest(ingestId)).resolves.toMatchObject({
      recordCount: 3,
      pendingCount: 1,
      failedCount: 1,
      succeededCount: 1,
    });
  });
});
