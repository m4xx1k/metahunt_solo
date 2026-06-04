import { Test } from "@nestjs/testing";

import { DRIZZLE } from "@metahunt/database";

import { RssExtractActivity } from "./activities/rss-extract.activity";
import { RssBackfillService } from "./rss-backfill.service";

type DbMock = {
  db: { select: jest.Mock };
  executeMissing: jest.Mock;
};

function buildDbMock(missingIds: string[]): DbMock {
  const executeMissing = jest
    .fn()
    .mockResolvedValue(missingIds.map((id) => ({ id })));
  const limit = jest.fn().mockReturnValue({ execute: executeMissing });
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });
  return { db: { select }, executeMissing };
}

describe("RssBackfillService", () => {
  const extractAndInsert = jest.fn();
  let service: RssBackfillService;

  async function bootstrap(missingIds: string[]) {
    const mocks = buildDbMock(missingIds);
    const moduleRef = await Test.createTestingModule({
      providers: [
        RssBackfillService,
        {
          provide: RssExtractActivity,
          useValue: { extractAndInsert },
        },
        { provide: DRIZZLE, useValue: mocks.db },
      ],
    }).compile();
    service = moduleRef.get(RssBackfillService);
  }

  beforeEach(() => {
    extractAndInsert.mockReset().mockResolvedValue(undefined);
  });

  it("returns zero counts when no records are pending", async () => {
    await bootstrap([]);
    const result = await service.extractMissing(50);
    expect(result).toEqual({ attempted: 0, succeeded: 0, failed: 0 });
    expect(extractAndInsert).not.toHaveBeenCalled();
  });

  it("calls extractAndInsert per pending record and counts successes", async () => {
    const ids = ["aaaa", "bbbb", "cccc"];
    await bootstrap(ids);

    const result = await service.extractMissing(50);

    expect(extractAndInsert).toHaveBeenCalledTimes(3);
    ids.forEach((id, i) =>
      expect(extractAndInsert).toHaveBeenNthCalledWith(i + 1, id),
    );
    expect(result).toEqual({ attempted: 3, succeeded: 3, failed: 0 });
  });

  it("counts failures without aborting the loop", async () => {
    await bootstrap(["aaaa", "bbbb", "cccc"]);
    extractAndInsert
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);

    const result = await service.extractMissing(50);

    expect(extractAndInsert).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ attempted: 3, succeeded: 2, failed: 1 });
  });
});
