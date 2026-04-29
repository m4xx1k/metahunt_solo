import { Test } from "@nestjs/testing";
import { TemporalService } from "nestjs-temporal-core";

import { DRIZZLE, type Source } from "@metahunt/database";

import { RssSchedulerService } from "./rss-scheduler.service";

type DbMock = {
  db: { select: jest.Mock };
  where: jest.Mock;
  executeViaWhere: jest.Mock;
  executeDirect: jest.Mock;
};

function buildDbMock(sources: Source[]): DbMock {
  const executeViaWhere = jest.fn().mockResolvedValue(sources);
  const executeDirect = jest.fn().mockResolvedValue(sources);
  const where = jest.fn().mockReturnValue({ execute: executeViaWhere });
  const from = jest.fn().mockReturnValue({ where, execute: executeDirect });
  const select = jest.fn().mockReturnValue({ from });
  return { db: { select }, where, executeViaWhere, executeDirect };
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
  let service: RssSchedulerService;
  let mocks: DbMock;

  async function bootstrap(sources: Source[]) {
    mocks = buildDbMock(sources);
    const moduleRef = await Test.createTestingModule({
      providers: [
        RssSchedulerService,
        { provide: TemporalService, useValue: { startWorkflow } },
        { provide: DRIZZLE, useValue: mocks.db },
      ],
    }).compile();
    service = moduleRef.get(RssSchedulerService);
  }

  beforeEach(() => {
    startWorkflow.mockReset().mockResolvedValue(undefined);
  });

  it("ingestRemote filters to sources with rssUrl and starts a workflow per source", async () => {
    await bootstrap([remoteSource]);

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
          new RegExp(`^rss-ingest-${remoteSource.id}-\\d+$`),
        ),
        taskQueue: "rss-ingest",
      }),
    );
  });

  it("ingestAll skips the rssUrl filter and starts a workflow per source", async () => {
    await bootstrap([remoteSource, localSource]);

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
});
