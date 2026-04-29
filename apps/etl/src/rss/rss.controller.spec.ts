import { Test } from "@nestjs/testing";

import { RssController } from "./rss.controller";
import { RssSchedulerService } from "./rss-scheduler.service";

describe("RssController", () => {
  const ingestAll = jest.fn();
  const ingestRemote = jest.fn();
  let controller: RssController;

  beforeEach(async () => {
    ingestAll.mockReset().mockResolvedValue(undefined);
    ingestRemote.mockReset().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      controllers: [RssController],
      providers: [
        {
          provide: RssSchedulerService,
          useValue: { ingestAll, ingestRemote },
        },
      ],
    }).compile();
    controller = moduleRef.get(RssController);
  });

  it("GET /rss delegates to scheduler.ingestAll (not ingestRemote)", () => {
    const result = controller.triggerAll();

    expect(ingestAll).toHaveBeenCalledTimes(1);
    expect(ingestAll).toHaveBeenCalledWith();
    expect(ingestRemote).not.toHaveBeenCalled();
    expect(result).toEqual({ triggered: "all" });
  });
});
