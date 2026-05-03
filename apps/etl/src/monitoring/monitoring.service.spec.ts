import { Test } from "@nestjs/testing";

import { DRIZZLE, schema } from "@metahunt/database";

import { MonitoringService } from "./monitoring.service";

interface RowsThenTotal {
  rows: Record<string, unknown>[];
  total: number;
}

// Mocks the two-query shape of MonitoringService.listRecords:
//   1. rows query: select(...).from().leftJoin().where().orderBy().limit().offset()
//   2. count query: select({value: count()}).from().where()
// Each call to `select` advances to the next chain.
function buildListRecordsDbMock({ rows, total }: RowsThenTotal) {
  const offset = jest.fn().mockResolvedValue(rows);
  const limit = jest.fn().mockReturnValue({ offset });
  const orderBy = jest.fn().mockReturnValue({ limit });
  const whereRows = jest.fn().mockReturnValue({ orderBy });
  const leftJoin = jest.fn().mockReturnValue({ where: whereRows });
  const fromRows = jest.fn().mockReturnValue({ leftJoin });

  const whereCount = jest.fn().mockResolvedValue([{ value: total }]);
  const fromCount = jest.fn().mockReturnValue({ where: whereCount });

  const selectCalls: unknown[] = [];
  const select = jest.fn().mockImplementation((shape: unknown) => {
    selectCalls.push(shape);
    return selectCalls.length === 1 ? { from: fromRows } : { from: fromCount };
  });

  return { db: { select }, selectCalls };
}

describe("MonitoringService", () => {
  describe("listRecords", () => {
    async function bootstrap(input: RowsThenTotal) {
      const mocks = buildListRecordsDbMock(input);
      const moduleRef = await Test.createTestingModule({
        providers: [
          MonitoringService,
          { provide: DRIZZLE, useValue: mocks.db },
        ],
      }).compile();
      return { service: moduleRef.get(MonitoringService), mocks };
    }

    it("projects description so the web feed renders it without a per-row detail fetch", async () => {
      const row = {
        id: "11111111-1111-1111-1111-111111111111",
        sourceId: "22222222-2222-2222-2222-222222222222",
        sourceCode: "djinni",
        sourceDisplayName: "Djinni",
        rssIngestId: "33333333-3333-3333-3333-333333333333",
        externalId: "ext-1",
        hash: "abc123",
        title: "Senior Backend Engineer",
        description: "Long job description text",
        link: "https://example.com/job/1",
        category: "Backend",
        publishedAt: new Date("2026-05-01T00:00:00Z"),
        createdAt: new Date("2026-05-01T00:01:00Z"),
        extractedAt: null,
        extractedData: null,
      };
      const { service, mocks } = await bootstrap({ rows: [row], total: 1 });

      const result = await service.listRecords({ limit: 50, offset: 0 });

      // Regression target: description must be in the projected shape.
      expect(mocks.selectCalls[0]).toEqual(
        expect.objectContaining({
          description: schema.rssRecords.description,
          extractedData: schema.rssRecords.extractedData,
        }),
      );
      expect(result.items[0]).toMatchObject({
        description: "Long job description text",
        extracted: false,
      });
    });

    it("derives `extracted: true` when extractedAt is set", async () => {
      const row = {
        id: "11111111-1111-1111-1111-111111111111",
        sourceId: "22222222-2222-2222-2222-222222222222",
        sourceCode: "djinni",
        sourceDisplayName: "Djinni",
        rssIngestId: "33333333-3333-3333-3333-333333333333",
        externalId: null,
        hash: "h",
        title: "x",
        description: null,
        link: null,
        category: null,
        publishedAt: new Date(),
        createdAt: new Date(),
        extractedAt: new Date(),
        extractedData: { role: "Backend Developer" },
      };
      const { service } = await bootstrap({ rows: [row], total: 1 });

      const result = await service.listRecords({ limit: 50, offset: 0 });

      expect(result.items[0].extracted).toBe(true);
      expect(result.hasMore).toBe(false);
    });

    it("reports hasMore when offset+items < total", async () => {
      const { service } = await bootstrap({ rows: [], total: 100 });

      const result = await service.listRecords({ limit: 20, offset: 0 });

      expect(result.total).toBe(100);
      expect(result.hasMore).toBe(true);
    });
  });
});
