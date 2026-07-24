import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Query,
  Redirect,
} from "@nestjs/common";
import { ApiFoundResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { isbot } from "isbot";

import { AnalyticsService } from "../../platform/analytics/analytics.service";
import { isUuid } from "../../platform/shared/query-parsing";

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
    // Browser journey, stamped on feed apply links as `?j=<uuid>` (localStorage
    // id, unreadable at this origin otherwise). Missing/invalid never fails the
    // redirect — it just falls back to anonymous tracking.
    @Query("j") journeyIdRaw?: string,
    @Headers("user-agent") userAgent?: string,
  ): Promise<{ url: string }> {
    const link = await this.feed.getApplyLink(id);
    if (!link) throw new NotFoundException("Vacancy link not found");
    // Crawlers hit /go/:id constantly (~95% of clicks); redirect them but never
    // record. Missing UA counts as a bot — real browsers always send one.
    if (!userAgent || isbot(userAgent)) return { url: link };
    const journeyId = journeyIdRaw && isUuid(journeyIdRaw) ? journeyIdRaw : undefined;
    void this.analytics.applyClicked(id, subscriptionId, journeyId);
    return { url: link };
  }
}
