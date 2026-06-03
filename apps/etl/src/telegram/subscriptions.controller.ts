import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  CreateSubscriptionRequest,
  CreateSubscriptionResponse,
} from "./subscriptions.contract";
import { SubscriptionsService } from "./subscriptions.service";

@Controller("subscriptions")
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  async create(
    @Body() body: Partial<CreateSubscriptionRequest>,
  ): Promise<CreateSubscriptionResponse> {
    const params = body?.params;
    if (params === null || typeof params !== "object" || Array.isArray(params)) {
      throw new BadRequestException("params must be an object");
    }

    const username = this.config.get<string>("TELEGRAM_BOT_USERNAME") ?? "";
    if (username.length === 0) {
      throw new BadRequestException(
        "TELEGRAM_BOT_USERNAME is not configured — cannot build the deep link",
      );
    }

    const id = await this.subscriptions.create(params);
    return { id, deepLink: `https://t.me/${username}?start=${id}` };
  }
}
