import { ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { LoaderController } from "./loader.controller";
import { LoaderBackfillService } from "./services/loader-backfill.service";

describe("LoaderController", () => {
  const loadMissing = jest.fn();
  const isRunning = jest.fn();
  const countPending = jest.fn();
  const loadAllInBackground = jest.fn();
  let controller: LoaderController;

  beforeEach(async () => {
    loadMissing
      .mockReset()
      .mockResolvedValue({ attempted: 0, succeeded: 0, failed: 0 });
    isRunning.mockReset().mockReturnValue(false);
    countPending.mockReset().mockResolvedValue(0);
    loadAllInBackground.mockReset().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      controllers: [LoaderController],
      providers: [
        {
          provide: LoaderBackfillService,
          useValue: {
            loadMissing,
            isRunning,
            countPending,
            loadAllInBackground,
          },
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

  describe("POST /loader/backfill/all", () => {
    it("returns accepted + pending count and kicks off the background job", async () => {
      countPending.mockResolvedValueOnce(1234);

      const result = await controller.backfillAll(undefined);

      expect(countPending).toHaveBeenCalledTimes(1);
      expect(loadAllInBackground).toHaveBeenCalledWith(100);
      expect(result).toEqual({ accepted: true, pending: 1234, batchSize: 100 });
    });

    it("forwards a valid batchSize", async () => {
      countPending.mockResolvedValueOnce(50);

      const result = await controller.backfillAll("25");

      expect(loadAllInBackground).toHaveBeenCalledWith(25);
      expect(result.batchSize).toBe(25);
    });

    it("rejects when a backfill is already running", async () => {
      isRunning.mockReturnValueOnce(true);

      await expect(controller.backfillAll(undefined)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(countPending).not.toHaveBeenCalled();
      expect(loadAllInBackground).not.toHaveBeenCalled();
    });

    it("rejects an out-of-range batchSize before snapshotting", async () => {
      await expect(controller.backfillAll("0")).rejects.toThrow(
        /batchSize must be an integer in 1\.\.500/,
      );
      await expect(controller.backfillAll("501")).rejects.toThrow(
        /batchSize must be an integer in 1\.\.500/,
      );
      expect(countPending).not.toHaveBeenCalled();
      expect(loadAllInBackground).not.toHaveBeenCalled();
    });

    it("rejects a non-integer batchSize", async () => {
      await expect(controller.backfillAll("abc")).rejects.toThrow(
        /batchSize must be an integer/,
      );
    });
  });
});
