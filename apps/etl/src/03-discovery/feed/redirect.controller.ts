import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Redirect,
} from "@nestjs/common";

import { AnalyticsService } from "../../platform/analytics/analytics.service";
import { FeedService } from "./feed.service";

// Outbound "apply" redirect. Digest cards link here (`/go/:id`) instead of
// straight to Djinni/DOU, so every apply tap passes through metahunt — the seam
// where click tracking hangs. Server-side capture is the only option here:
// a Telegram link tap can't run JS.
@Controller("go")
export class RedirectController {
  constructor(
    private readonly feed: FeedService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get(":id")
  @Redirect()
  async apply(
    @Param("id") id: string,
    // Referring subscription, stamped on digest links as `?s=<uuid>`. Absent for
    // links opened outside a digest — then the click is simply not attributed.
    @Query("s") subscriptionId?: string,
  ): Promise<{ url: string }> {
    const link = await this.feed.getApplyLink(id);
    if (!link) throw new NotFoundException("Vacancy link not found");
    if (subscriptionId) this.analytics.applyClicked(subscriptionId, id);
    return { url: link };
  }
}
