import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { TemporalService } from "nestjs-temporal-core";
import { ScheduleAlreadyRunning, ScheduleOverlapPolicy } from "@temporalio/client";

import { DRIZZLE, type Source } from "@metahunt/database";

import { RssExtractActivity } from "./activities/rss-extract.activity";
import { RssSchedulerService } from "./rss-scheduler.service";

type DbMock = {
  db: { select: jest.Mock };
  where: jest.Mock;
  executeViaWhere: jest.Mock;
  executeDirect: jest.Mock;
  executeMissing: jest.Mock;
};

function buildDbMock(opts: {
  sources?: Source[];
  missingIds?: string[];
}): DbMock {
  const sources = opts.sources ?? [];
  const missingIds = opts.missingIds ?? [];
  const executeViaWhere = jest.fn().mockResolvedValue(sources);
  const executeDirect = jest.fn().mockResolvedValue(sources);
  const executeMissing = jest
    .fn()
    .mockResolvedValue(missingIds.map((id) => ({ id })));
  const limit = jest.fn().mockReturnValue({ execute: executeMissing });
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest
    .fn()
    .mockReturnValue({ execute: executeViaWhere, orderBy });
  const from = jest.fn().mockReturnValue({ where, execute: executeDirect });
  const select = jest.fn().mockReturnValue({ from });
  return {
    db: { select },
    where,
    executeViaWhere,
    executeDirect,
    executeMissing,
  };
}

const remoteSource: Source = {
  id: "11111111-1111-1111-1111-111111111111",
  code: "djinni",
  displayName: "Djinni",
  baseUrl: "https://djinni.co",
  rssUrl: "https://djinni.co/jobs/rss/",
  createdAt: new Date(),
};

const localSource: Source = {
  id: "22222222-2222-2222-2222-222222222222",
  code: "dou",
  displayName: "DOU",
  baseUrl: "https://dou.ua",
  rssUrl: null,
  createdAt: new Date(),
};

describe("RssSchedulerService", () => {
  const startWorkflow = jest.fn();
  const extractAndInsert = jest.fn();
  let getRawClient: jest.Mock;
  const configValues: Record<string, unknown> = {
    RSS_INGEST_INTERVAL_HOURS: 1,
    TEMPORAL_TASK_QUEUE: "rss-ingest",
  };
  let service: RssSchedulerService;
  let mocks: DbMock;

  async function bootstrap(
    opts: { sources?: Source[]; missingIds?: string[] } = {},
  ) {
    mocks = buildDbMock(opts);
    getRawClient = jest.fn().mockReturnValue(null);
    const moduleRef = await Test.createTestingModule({
      providers: [
        RssSchedulerService,
        {
          provide: TemporalService,
          useValue: {
            startWorkflow,
            client: { getRawClient },
          },
        },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => configValues[key] },
        },
        {
          provide: RssExtractActivity,
          useValue: { extractAndInsert },
        },
        { provide: DRIZZLE, useValue: mocks.db },
      ],
    }).compile();
    service = moduleRef.get(RssSchedulerService);
  }

  beforeEach(() => {
    startWorkflow.mockReset().mockResolvedValue(undefined);
    extractAndInsert.mockReset().mockResolvedValue(undefined);
    configValues.RSS_INGEST_INTERVAL_HOURS = 1;
    configValues.TEMPORAL_TASK_QUEUE = "rss-ingest";
  });

  it("ingestRemote filters to sources with rssUrl and starts a workflow per source", async () => {
    await bootstrap({ sources: [remoteSource] });

    await service.ingestRemote();

    expect(mocks.where).toHaveBeenCalledTimes(1);
    expect(mocks.executeViaWhere).toHaveBeenCalledTimes(1);
    expect(mocks.executeDirect).not.toHaveBeenCalled();
    expect(startWorkflow).toHaveBeenCalledTimes(1);
    expect(startWorkflow).toHaveBeenCalledWith(
      "rssIngestWorkflow",
      [remoteSource.id],
      expect.objectContaining({
        workflowId: expect.stringMatching(
          new RegExp(
            `^rss-ingest-${remoteSource.code}-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}$`,
          ),
        ),
        taskQueue: "rss-ingest",
      }),
    );
  });

  it("ingestAll skips the rssUrl filter and starts a workflow per source", async () => {
    await bootstrap({ sources: [remoteSource, localSource] });

    await service.ingestAll();

    expect(mocks.where).not.toHaveBeenCalled();
    expect(mocks.executeDirect).toHaveBeenCalledTimes(1);
    expect(mocks.executeViaWhere).not.toHaveBeenCalled();
    expect(startWorkflow).toHaveBeenCalledTimes(2);
    expect(startWorkflow).toHaveBeenNthCalledWith(
      1,
      "rssIngestWorkflow",
      [remoteSource.id],
      expect.objectContaining({ taskQueue: "rss-ingest" }),
    );
    expect(startWorkflow).toHaveBeenNthCalledWith(
      2,
      "rssIngestWorkflow",
      [localSource.id],
      expect.objectContaining({ taskQueue: "rss-ingest" }),
    );
  });

  describe("ensureSchedule", () => {
    function buildRawClient(opts: {
      createImpl?: jest.Mock;
      updateImpl?: jest.Mock;
    }) {
      const create = opts.createImpl ?? jest.fn().mockResolvedValue(undefined);
      const update = opts.updateImpl ?? jest.fn().mockResolvedValue(undefined);
      const handle = { update };
      const getHandle = jest.fn().mockReturnValue(handle);
      return { schedule: { create, getHandle }, handle, create, update };
    }

    it("no-ops when the raw Temporal client is unavailable", async () => {
      await bootstrap();
      // getRawClient defaults to null in bootstrap
      await service.ensureSchedule();
      expect(getRawClient).toHaveBeenCalled();
    });

    it("creates a schedule with the env-driven interval and Kyiv calendar window", async () => {
      await bootstrap();
      const raw = buildRawClient({});
      getRawClient.mockReturnValue(raw);
      configValues.RSS_INGEST_INTERVAL_HOURS = 2;

      await service.ensureSchedule();

      expect(raw.create).toHaveBeenCalledTimes(1);
      const opts = raw.create.mock.calls[0][0];
      expect(opts.scheduleId).toBe("rss-ingest-hourly");
      expect(opts.spec).toEqual({
        calendars: [
          { minute: 0, hour: { start: 6, end: 22, step: 2 } },
        ],
        timezone: "Europe/Kyiv",
      });
      expect(opts.action).toEqual({
        type: "startWorkflow",
        workflowType: "rssIngestAllWorkflow",
        taskQueue: "rss-ingest",
        workflowId: "rss-ingest-all",
      });
      expect(opts.policies).toEqual({ overlap: ScheduleOverlapPolicy.SKIP });
      expect(raw.update).not.toHaveBeenCalled();
    });

    it("falls back to handle.update when the schedule already exists", async () => {
      await bootstrap();
      const raw = buildRawClient({
        createImpl: jest
          .fn()
          .mockRejectedValue(
            new ScheduleAlreadyRunning("exists", "rss-ingest-hourly"),
          ),
      });
      getRawClient.mockReturnValue(raw);

      await service.ensureSchedule();

      expect(raw.create).toHaveBeenCalledTimes(1);
      expect(raw.update).toHaveBeenCalledTimes(1);
      const updateFn = raw.update.mock.calls[0][0] as (
        prev: { state: unknown },
      ) => unknown;
      const result = updateFn({ state: { paused: false, note: "n" } }) as {
        spec: unknown;
        state: unknown;
      };
      // updater preserves prev.state and supplies the fresh spec/action
      expect(result.state).toEqual({ paused: false, note: "n" });
      expect(result.spec).toEqual({
        calendars: [
          { minute: 0, hour: { start: 6, end: 22, step: 1 } },
        ],
        timezone: "Europe/Kyiv",
      });
    });
  });

  describe("extractMissing", () => {
    it("returns zero counts when no records are pending", async () => {
      await bootstrap({ missingIds: [] });
      const result = await service.extractMissing(50);
      expect(result).toEqual({ attempted: 0, succeeded: 0, failed: 0 });
      expect(extractAndInsert).not.toHaveBeenCalled();
    });

    it("calls extractAndInsert per pending record and counts successes", async () => {
      const ids = ["aaaa", "bbbb", "cccc"];
      await bootstrap({ missingIds: ids });

      const result = await service.extractMissing(50);

      expect(extractAndInsert).toHaveBeenCalledTimes(3);
      ids.forEach((id, i) =>
        expect(extractAndInsert).toHaveBeenNthCalledWith(i + 1, id),
      );
      expect(result).toEqual({ attempted: 3, succeeded: 3, failed: 0 });
    });

    it("counts failures without aborting the loop", async () => {
      await bootstrap({ missingIds: ["aaaa", "bbbb", "cccc"] });
      extractAndInsert
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce(undefined);

      const result = await service.extractMissing(50);

      expect(extractAndInsert).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ attempted: 3, succeeded: 2, failed: 1 });
    });
  });
});
