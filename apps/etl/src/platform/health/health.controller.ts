import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { TemporalService } from "nestjs-temporal-core";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";
import { StorageService } from "../storage/storage.service";

type CheckResult = { ok: true; latencyMs: number } | { ok: false; error: string };

export type HealthResponse = {
  status: "ok" | "degraded";
  checks: {
    postgres: CheckResult;
    storage: CheckResult;
    temporal: CheckResult;
  };
};

@Controller("healthz")
export class HealthController {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly storage: StorageService,
    private readonly temporal: TemporalService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthResponse> {
    const [postgres, storage, temporal] = await Promise.all([
      time(() => this.db.execute(sql`SELECT 1`)),
      time(() => this.storage.ping()),
      time(async () => {
        const status = this.temporal.getHealth().status;
        if (status !== "healthy") {
          throw new Error(`temporal health=${status}`);
        }
      }),
    ]);

    const body: HealthResponse = {
      status:
        postgres.ok && storage.ok && temporal.ok ? "ok" : "degraded",
      checks: { postgres, storage, temporal },
    };

    if (body.status === "degraded") {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }
}

async function time(fn: () => Promise<unknown>): Promise<CheckResult> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
