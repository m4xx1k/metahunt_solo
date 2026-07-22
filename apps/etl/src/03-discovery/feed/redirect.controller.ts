import { Controller, Get, NotFoundException, Param, Query, Redirect } from "@nestjs/common";
import { ApiFoundResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { AnalyticsService } from "../../platform/analytics/analytics.service";

import { FeedService } from "./feed.service";

// Outbound "apply" redirect. Web cards and digest cards link here (`/go/:id`)
// instead of straight to Djinni/DOU, so every apply tap passes through metahunt —
// the seam where click tracking hangs. Server-side capture is the only option
// that works on both surfaces: a Telegram link tap can't run JS.
@Controller("go")
@ApiTags("feed")
export class RedirectController {
  constructor(
    private readonly feed: FeedService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get(":id")
  @Redirect()
  @ApiOperation({ summary: "Redirect to the original vacancy application URL" })
  @ApiFoundResponse({ description: "Redirect to the source vacancy URL." })
  @ApiNotFoundResponse({ description: "Vacancy or its application URL was not found." })
  async apply(
    @Param("id") id: string,
    // Referring subscription, stamped on digest links as `?s=<uuid>`. Absent for
    // web taps — the click is still logged, just not attributed to a subscription.
    @Query("s") subscriptionId?: string,
  ): Promise<{ url: string }> {
    const link = await this.feed.getApplyLink(id);
    if (!link) throw new NotFoundException("Vacancy link not found");
    void this.analytics.applyClicked(id, subscriptionId);
    return { url: link };
  }
}
