import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { ApiBadRequestResponse, ApiCreatedResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { ApiErrorResponseDto } from "../../platform/swagger/api-error.dto";

import type {
  CreateSubscriptionRequest,
  CreateSubscriptionResponse,
} from "./subscriptions.contract";
import { SubscriptionsService } from "./subscriptions.service";
import { TelegramService } from "./telegram.service";

@Controller("subscriptions")
@ApiTags("subscriptions")
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly telegram: TelegramService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Create a pending Telegram subscription deep link" })
  @ApiCreatedResponse({ description: "Pending subscription UUID and Telegram deep link." })
  @ApiBadRequestResponse({
    description: "Invalid subscription parameters or Telegram is unavailable.",
    type: ApiErrorResponseDto,
  })
  async create(
    @Body() body: Partial<CreateSubscriptionRequest>,
  ): Promise<CreateSubscriptionResponse> {
    const params = body?.params;
    if (params === null || typeof params !== "object" || Array.isArray(params)) {
      throw new BadRequestException("params must be an object");
    }

    // Username comes from the live bot (getMe at startup). Missing → the poller
    // is dormant (no/invalid TELEGRAM_BOT_TOKEN), so a deep link is useless.
    const username = this.telegram.botUsername;
    if (!username) {
      throw new BadRequestException("Telegram bot is not available — check TELEGRAM_BOT_TOKEN");
    }

    const candidateId = typeof body?.candidateId === "string" ? body.candidateId : undefined;

    const id = await this.subscriptions.create(params, candidateId);
    return { id, deepLink: `https://t.me/${username}?start=${id}` };
  }
}
