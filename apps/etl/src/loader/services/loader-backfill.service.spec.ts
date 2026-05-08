import { Test } from "@nestjs/testing";

import { DRIZZLE } from "@metahunt/database";

import { LoaderBackfillService } from "./loader-backfill.service";
import { VacancyLoaderService } from "./vacancy-loader.service";

type LoadMissingDb = {
  db: { select: jest.Mock };
  executePending: jest.Mock;
};

// Builds a mock that satisfies both `loadMissing` (limited query) and
// `loadAllInBackground` (unlimited query). Drizzle's chain ends in
// `.execute()` either after `.limit(...)` (loadMissing) or after
// `.orderBy(...)` (loadAllInBackground); both terminals share the same
// `executePending` mock.
function buildLoadMissingDb(pendingIds: string[]): LoadMissingDb {
  const executePending = jest
    .fn()
    .mockResolvedValue(pendingIds.map((id) => ({ id })));
  const limit = jest.fn().mockReturnValue({ execute: executePending });
  const orderBy = jest.fn().mockReturnValue({ limit, execute: executePending });
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });
  return { db: { select }, executePending };
}

// `countPending` runs a different chain: select(count).from(...).where(...).execute().
// Build a simpler mock that returns a single { count: '<n>' } row.
function buildCountDb(count: number): { db: { select: jest.Mock } } {
  const execute = jest
    .fn()
    .mockResolvedValue([{ count: String(count) }]);
  const where = jest.fn().mockReturnValue({ execute });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });
  return { db: { select } };
}

describe("LoaderBackfillService", () => {
  const loadFromRecord = jest.fn();
  let service: LoaderBackfillService;

  async function bootstrap(db: { select: jest.Mock }): Promise<void> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LoaderBackfillService,
        {
          provide: VacancyLoaderService,
          useValue: { loadFromRecord },
        },
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(LoaderBackfillService);
  }

  beforeEach(() => {
    loadFromRecord.mockReset().mockResolvedValue("vac-id");
  });

  describe("loadMissing", () => {
    it("returns zero counts when no records are pending", async () => {
      const { db } = buildLoadMissingDb([]);
      await bootstrap(db);

      const result = await service.loadMissing(50);

      expect(result).toEqual({ attempted: 0, succeeded: 0, failed: 0 });
      expect(loadFromRecord).not.toHaveBeenCalled();
    });

    it("calls loadFromRecord per pending record and counts successes", async () => {
      const ids = ["aaaa", "bbbb", "cccc"];
      const { db } = buildLoadMissingDb(ids);
      await bootstrap(db);

      const result = await service.loadMissing(50);

      expect(loadFromRecord).toHaveBeenCalledTimes(3);
      ids.forEach((id, i) =>
        expect(loadFromRecord).toHaveBeenNthCalledWith(i + 1, id),
      );
      expect(result).toEqual({ attempted: 3, succeeded: 3, failed: 0 });
    });

    it("counts failures without aborting the loop", async () => {
      const { db } = buildLoadMissingDb(["aaaa", "bbbb", "cccc"]);
      await bootstrap(db);
      loadFromRecord
        .mockResolvedValueOnce("v1")
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce("v3");

      const result = await service.loadMissing(50);

      expect(loadFromRecord).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ attempted: 3, succeeded: 2, failed: 1 });
    });
  });

  describe("countPending", () => {
    it("returns the COUNT(*) result as a number", async () => {
      const { db } = buildCountDb(42);
      await bootstrap(db);

      await expect(service.countPending()).resolves.toBe(42);
    });

    it("treats an empty result as zero", async () => {
      const execute = jest.fn().mockResolvedValue([]);
      const where = jest.fn().mockReturnValue({ execute });
      const from = jest.fn().mockReturnValue({ where });
      const select = jest.fn().mockReturnValue({ from });
      await bootstrap({ select });

      await expect(service.countPending()).resolves.toBe(0);
    });
  });

  describe("loadAllInBackground", () => {
    it("processes every pending record, regardless of batchSize", async () => {
      const ids = ["a", "b", "c", "d", "e"];
      const { db } = buildLoadMissingDb(ids);
      await bootstrap(db);

      await service.loadAllInBackground(2);

      expect(loadFromRecord).toHaveBeenCalledTimes(5);
      ids.forEach((id, i) =>
        expect(loadFromRecord).toHaveBeenNthCalledWith(i + 1, id),
      );
    });

    it("does not throw when an individual record fails", async () => {
      const { db } = buildLoadMissingDb(["a", "b", "c"]);
      await bootstrap(db);
      loadFromRecord
        .mockResolvedValueOnce("v1")
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce("v3");

      await expect(service.loadAllInBackground(10)).resolves.toBeUndefined();
      expect(loadFromRecord).toHaveBeenCalledTimes(3);
    });

    it("clears the running flag after a successful run", async () => {
      const { db } = buildLoadMissingDb(["a", "b"]);
      await bootstrap(db);

      expect(service.isRunning()).toBe(false);
      await service.loadAllInBackground(10);
      expect(service.isRunning()).toBe(false);
    });

    it("clears the running flag even if the upfront query throws", async () => {
      const execute = jest.fn().mockRejectedValue(new Error("db down"));
      const orderBy = jest.fn().mockReturnValue({ execute });
      const where = jest.fn().mockReturnValue({ orderBy });
      const from = jest.fn().mockReturnValue({ where });
      const select = jest.fn().mockReturnValue({ from });
      await bootstrap({ select });

      await expect(
        service.loadAllInBackground(10),
      ).resolves.toBeUndefined();
      expect(service.isRunning()).toBe(false);
    });

    it("skips when already running and does not invoke the loader twice", async () => {
      const ids = ["a", "b"];
      const { db } = buildLoadMissingDb(ids);
      await bootstrap(db);

      // Hold the first record's loader call open so the second invocation
      // observes `running === true`.
      let release: () => void = () => {};
      loadFromRecord.mockImplementationOnce(
        () => new Promise<string>((resolve) => {
          release = () => resolve("v1");
        }),
      );

      const first = service.loadAllInBackground(10);
      // Yield once so the promise reaches the in-flight loadFromRecord.
      await Promise.resolve();
      await Promise.resolve();
      expect(service.isRunning()).toBe(true);

      const second = service.loadAllInBackground(10);
      await second;

      release();
      await first;

      // Two ids in the queue + the second call was a no-op = 2 invocations.
      expect(loadFromRecord).toHaveBeenCalledTimes(2);
    });

    it("returns immediately when nothing is pending", async () => {
      const { db } = buildLoadMissingDb([]);
      await bootstrap(db);

      await service.loadAllInBackground(10);

      expect(loadFromRecord).not.toHaveBeenCalled();
      expect(service.isRunning()).toBe(false);
    });
  });
});
