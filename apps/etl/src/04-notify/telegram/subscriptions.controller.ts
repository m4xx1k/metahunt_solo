import { BadRequestException, Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { CandidateLoaderService } from "../../03-discovery/cv/candidate-loader.service";
import type { JwtUser } from "../../platform/auth/auth.types";
import { CurrentUser } from "../../platform/auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../platform/auth/jwt-auth.guard";
import { isUuid } from "../../platform/shared/query-parsing";
import { ApiErrorResponseDto } from "../../platform/swagger/api-error.dto";

import {
  createSubscriptionResponse,
  type CreateSubscriptionRequest,
  type CreateSubscriptionResponse,
} from "./subscriptions.contract";
import { SubscriptionsService } from "./subscriptions.service";
import { TelegramService } from "./telegram.service";

@Controller("subscriptions")
@ApiTags("subscriptions")
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly telegram: TelegramService,
    private readonly candidates: CandidateLoaderService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Create a pending Telegram subscription deep link" })
  @ApiBearerAuth()
  @ApiCreatedResponse({ description: "Pending subscription UUID and Telegram deep link." })
  @ApiBadRequestResponse({
    description: "Invalid subscription parameters or Telegram is unavailable.",
    type: ApiErrorResponseDto,
  })
  async create(
    @CurrentUser() user: JwtUser,
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
    if (candidateId !== undefined) {
      throw new BadRequestException(
        "CV subscriptions require POST /subscriptions/cv with Bearer auth",
      );
    }

    const id = await this.subscriptions.create(params, {
      userId: user.userId,
      journeyId: browserJourneyId(body),
    });
    return createSubscriptionResponse(username, id);
  }

  @Post("cv")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Create an owner-bound CV Telegram subscription" })
  @ApiBearerAuth()
  @ApiCreatedResponse({
    description: "Owner-bound pending subscription UUID and Telegram deep link.",
  })
  @ApiBadRequestResponse({
    description: "Invalid CV subscription parameters.",
    type: ApiErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: "Missing or invalid Bearer token.",
    type: ApiErrorResponseDto,
  })
  async createCv(
    @CurrentUser() user: JwtUser,
    @Body() body: Partial<CreateSubscriptionRequest>,
  ): Promise<CreateSubscriptionResponse> {
    const params = body?.params;
    if (params === null || typeof params !== "object" || Array.isArray(params)) {
      throw new BadRequestException("params must be an object");
    }
    const candidateId = typeof body?.candidateId === "string" ? body.candidateId : undefined;
    if (!candidateId)
      throw new BadRequestException("candidateId is required for a CV subscription");

    const username = this.telegram.botUsername;
    if (!username) {
      throw new BadRequestException("Telegram bot is not available — check TELEGRAM_BOT_TOKEN");
    }
    await this.candidates.assertAccessibleCandidate(user.userId, candidateId);
    const id = await this.subscriptions.create(params, {
      candidateId,
      userId: user.userId,
      journeyId: browserJourneyId(body),
    });
    return createSubscriptionResponse(username, id);
  }
}

// The journey the browser has been carrying all along. It was a public field
// the controller never read, which is why the web funnel could not chain.
function browserJourneyId(body: Partial<CreateSubscriptionRequest>): string | undefined {
  const journeyId = body?.journeyId;
  return typeof journeyId === "string" && isUuid(journeyId) ? journeyId : undefined;
}
