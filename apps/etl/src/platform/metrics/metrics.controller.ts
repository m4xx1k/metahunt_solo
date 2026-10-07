import { Controller, Get, Res, UseGuards } from "@nestjs/common";
import { ApiExcludeEndpoint } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";

import type { Response } from "express";

import { MetricsAuthGuard } from "./metrics.guard";
import { MetricsService } from "./metrics.service";

@Controller("metrics")
@SkipThrottle()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @UseGuards(MetricsAuthGuard)
  @ApiExcludeEndpoint()
  async getMetrics(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader("Content-Type", this.metricsService.getContentType());
    return this.metricsService.getMetrics();
  }
}
