import { Test } from "@nestjs/testing";

import { DRIZZLE } from "@metahunt/database";

import { LoaderBackfillService } from "./loader-backfill.service";
import { VacancyLoaderService } from "./vacancy-loader.service";

type DbMock = {
  db: { select: jest.Mock };
  executePending: jest.Mock;
};

function buildDbMock(pendingIds: string[]): DbMock {
  const executePending = jest
    .fn()
    .mockResolvedValue(pendingIds.map((id) => ({ id })));
  const limit = jest.fn().mockReturnValue({ execute: executePending });
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });
  return { db: { select }, executePending };
}

describe("LoaderBackfillService", () => {
  const loadFromRecord = jest.fn();
  let service: LoaderBackfillService;

  async function bootstrap(pendingIds: string[]) {
    const mocks = buildDbMock(pendingIds);
    const moduleRef = await Test.createTestingModule({
      providers: [
        LoaderBackfillService,
        {
          provide: VacancyLoaderService,
          useValue: { loadFromRecord },
        },
        { provide: DRIZZLE, useValue: mocks.db },
      ],
    }).compile();
    service = moduleRef.get(LoaderBackfillService);
  }

  beforeEach(() => {
    loadFromRecord.mockReset().mockResolvedValue("vac-id");
  });

  it("returns zero counts when no records are pending", async () => {
    await bootstrap([]);
    const result = await service.loadMissing(50);
    expect(result).toEqual({ attempted: 0, succeeded: 0, failed: 0 });
    expect(loadFromRecord).not.toHaveBeenCalled();
  });

  it("calls loadFromRecord per pending record and counts successes", async () => {
    const ids = ["aaaa", "bbbb", "cccc"];
    await bootstrap(ids);

    const result = await service.loadMissing(50);

    expect(loadFromRecord).toHaveBeenCalledTimes(3);
    ids.forEach((id, i) =>
      expect(loadFromRecord).toHaveBeenNthCalledWith(i + 1, id),
    );
    expect(result).toEqual({ attempted: 3, succeeded: 3, failed: 0 });
  });

  it("counts failures without aborting the loop", async () => {
    await bootstrap(["aaaa", "bbbb", "cccc"]);
    loadFromRecord
      .mockResolvedValueOnce("v1")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("v3");

    const result = await service.loadMissing(50);

    expect(loadFromRecord).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ attempted: 3, succeeded: 2, failed: 1 });
  });
});
