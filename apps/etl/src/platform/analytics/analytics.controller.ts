import { Body, Controller, Post } from "@nestjs/common";
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { ApiErrorResponseDto } from "../swagger/api-error.dto";

import { AnalyticsService } from "./analytics.service";
import { parseBrowserEventInput } from "./browser-event.contract";

const MAX_BROWSER_EVENTS_PER_MINUTE = 120;

@Controller("analytics")
@ApiTags("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post("events")
  @Throttle({ default: { limit: MAX_BROWSER_EVENTS_PER_MINUTE, ttl: 60_000 } })
  @ApiOperation({ summary: "Record an allow-listed browser funnel event" })
  @ApiOkResponse({ description: "Event accepted idempotently." })
  @ApiBadRequestResponse({ description: "Invalid event payload.", type: ApiErrorResponseDto })
  async capture(@Body() body: unknown): Promise<{ accepted: true }> {
    await this.analytics.browserEvent(parseBrowserEventInput(body));
    return { accepted: true };
  }
}
