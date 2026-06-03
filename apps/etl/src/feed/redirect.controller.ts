import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Redirect,
} from "@nestjs/common";

import { FeedService } from "./feed.service";

// Outbound "apply" redirect. Digest cards link here (`/go/:id`) instead of
// straight to Djinni/DOU, so every apply tap passes through metahunt — the seam
// where click tracking will hang. For now it's a plain 302 to the source.
@Controller("go")
export class RedirectController {
  constructor(private readonly feed: FeedService) {}

  @Get(":id")
  @Redirect()
  async apply(@Param("id") id: string): Promise<{ url: string }> {
    const link = await this.feed.getApplyLink(id);
    // TODO(tracking): record the click (vacancy + referring subscription) here.
    if (!link) throw new NotFoundException("Vacancy link not found");
    return { url: link };
  }
}
