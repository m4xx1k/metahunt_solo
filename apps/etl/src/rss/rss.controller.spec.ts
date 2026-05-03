import { Test } from "@nestjs/testing";

import { RssController } from "./rss.controller";
import { RssSchedulerService } from "./rss-scheduler.service";

describe("RssController", () => {
  const ingestAll = jest.fn();
  const ingestRemote = jest.fn();
  const extractMissing = jest.fn();
  let controller: RssController;

  beforeEach(async () => {
    ingestAll.mockReset().mockResolvedValue(undefined);
    ingestRemote.mockReset().mockResolvedValue(undefined);
    extractMissing
      .mockReset()
      .mockResolvedValue({ attempted: 0, succeeded: 0, failed: 0 });
    const moduleRef = await Test.createTestingModule({
      controllers: [RssController],
      providers: [
        {
          provide: RssSchedulerService,
          useValue: { ingestAll, ingestRemote, extractMissing },
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

  describe("POST /rss/extract-missing", () => {
    it("uses default limit (100) when not specified", async () => {
      extractMissing.mockResolvedValueOnce({
        attempted: 7,
        succeeded: 6,
        failed: 1,
      });

      const result = await controller.extractMissing(undefined);

      expect(extractMissing).toHaveBeenCalledWith(100);
      expect(result).toEqual({ attempted: 7, succeeded: 6, failed: 1 });
    });

    it("forwards a valid integer limit", async () => {
      await controller.extractMissing("25");
      expect(extractMissing).toHaveBeenCalledWith(25);
    });

    it("rejects a non-integer limit", async () => {
      await expect(controller.extractMissing("abc")).rejects.toThrow(
        /limit must be an integer/,
      );
      expect(extractMissing).not.toHaveBeenCalled();
    });

    it("rejects a limit out of range", async () => {
      await expect(controller.extractMissing("0")).rejects.toThrow(/1\.\.500/);
      await expect(controller.extractMissing("501")).rejects.toThrow(
        /1\.\.500/,
      );
    });
  });
});
