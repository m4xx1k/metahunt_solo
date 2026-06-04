import { HttpException, HttpStatus } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { TemporalService } from "nestjs-temporal-core";

import { DRIZZLE } from "@metahunt/database";
import { StorageService } from "../storage/storage.service";

import { HealthController, type HealthResponse } from "./health.controller";

describe("HealthController", () => {
  const dbExecute = jest.fn();
  const storagePing = jest.fn();
  const temporalGetHealth = jest.fn();

  async function bootstrap(): Promise<HealthController> {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DRIZZLE, useValue: { execute: dbExecute } },
        { provide: StorageService, useValue: { ping: storagePing } },
        { provide: TemporalService, useValue: { getHealth: temporalGetHealth } },
      ],
    }).compile();
    return moduleRef.get(HealthController);
  }

  beforeEach(() => {
    dbExecute.mockReset().mockResolvedValue(undefined);
    storagePing.mockReset().mockResolvedValue(undefined);
    temporalGetHealth.mockReset().mockReturnValue({ status: "healthy" });
  });

  it("returns 200 + status:ok when every dependency answers", async () => {
    const controller = await bootstrap();

    const result = await controller.check();

    expect(result.status).toBe("ok");
    expect(result.checks.postgres.ok).toBe(true);
    expect(result.checks.storage.ok).toBe(true);
    expect(result.checks.temporal.ok).toBe(true);
    expect(dbExecute).toHaveBeenCalledTimes(1);
    expect(storagePing).toHaveBeenCalledTimes(1);
    expect(temporalGetHealth).toHaveBeenCalledTimes(1);
  });

  it("throws 503 with per-dependency error detail when postgres is down", async () => {
    dbExecute.mockRejectedValue(new Error("connection refused"));
    const controller = await bootstrap();

    await expect(controller.check()).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });

    try {
      await controller.check();
      fail("expected HttpException");
    } catch (error) {
      const httpError = error as HttpException;
      const body = httpError.getResponse() as HealthResponse;
      expect(body.status).toBe("degraded");
      expect(body.checks.postgres).toEqual({
        ok: false,
        error: "connection refused",
      });
      expect(body.checks.storage.ok).toBe(true);
      expect(body.checks.temporal.ok).toBe(true);
    }
  });

  it("marks temporal degraded when getHealth() reports non-healthy", async () => {
    temporalGetHealth.mockReturnValue({ status: "degraded" });
    const controller = await bootstrap();

    try {
      await controller.check();
      fail("expected HttpException");
    } catch (error) {
      const httpError = error as HttpException;
      const body = httpError.getResponse() as HealthResponse;
      expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body.checks.temporal).toEqual({
        ok: false,
        error: "temporal health=degraded",
      });
    }
  });
});
