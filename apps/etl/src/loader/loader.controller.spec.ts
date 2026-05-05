import { Test } from "@nestjs/testing";

import { LoaderController } from "./loader.controller";
import { LoaderBackfillService } from "./services/loader-backfill.service";

describe("LoaderController", () => {
  const loadMissing = jest.fn();
  let controller: LoaderController;

  beforeEach(async () => {
    loadMissing
      .mockReset()
      .mockResolvedValue({ attempted: 0, succeeded: 0, failed: 0 });
    const moduleRef = await Test.createTestingModule({
      controllers: [LoaderController],
      providers: [
        {
          provide: LoaderBackfillService,
          useValue: { loadMissing },
        },
      ],
    }).compile();
    controller = moduleRef.get(LoaderController);
  });

  describe("POST /loader/backfill", () => {
    it("uses default limit (100) when not specified", async () => {
      loadMissing.mockResolvedValueOnce({
        attempted: 7,
        succeeded: 6,
        failed: 1,
      });

      const result = await controller.backfill(undefined);

      expect(loadMissing).toHaveBeenCalledWith(100);
      expect(result).toEqual({ attempted: 7, succeeded: 6, failed: 1 });
    });

    it("forwards a valid integer limit", async () => {
      await controller.backfill("25");
      expect(loadMissing).toHaveBeenCalledWith(25);
    });

    it("rejects a non-integer limit", async () => {
      await expect(controller.backfill("abc")).rejects.toThrow(
        /limit must be an integer/,
      );
      expect(loadMissing).not.toHaveBeenCalled();
    });

    it("rejects a limit out of range", async () => {
      await expect(controller.backfill("0")).rejects.toThrow(/1\.\.500/);
      await expect(controller.backfill("501")).rejects.toThrow(/1\.\.500/);
    });
  });
});
