import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { TemporalService } from "nestjs-temporal-core";
import { ScheduleAlreadyRunning, ScheduleOverlapPolicy } from "@temporalio/client";

import { RssSchedulerService } from "./rss-scheduler.service";

describe("RssSchedulerService", () => {
  let getRawClient: jest.Mock;
  const configValues: Record<string, unknown> = {
    RSS_INGEST_INTERVAL_HOURS: 1,
    TEMPORAL_TASK_QUEUE: "rss-ingest",
  };
  let service: RssSchedulerService;

  async function bootstrap() {
    getRawClient = jest.fn().mockReturnValue(null);
    const moduleRef = await Test.createTestingModule({
      providers: [
        RssSchedulerService,
        {
          provide: TemporalService,
          useValue: { client: { getRawClient } },
        },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => configValues[key] },
        },
      ],
    }).compile();
    service = moduleRef.get(RssSchedulerService);
  }

  beforeEach(() => {
    configValues.RSS_INGEST_INTERVAL_HOURS = 1;
    configValues.TEMPORAL_TASK_QUEUE = "rss-ingest";
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
});
