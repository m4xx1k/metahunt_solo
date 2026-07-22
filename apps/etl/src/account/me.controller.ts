import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import type { JwtUser } from "../platform/auth/auth.types";
import { CurrentUser } from "../platform/auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../platform/auth/jwt-auth.guard";
import { ApiErrorResponseDto, OkResponseDto } from "../platform/swagger/api-error.dto";

import { type MeCv, type MeSubscription, UpdateSubscriptionStateDto } from "./me.contract";
import { MeService } from "./me.service";

// The logged-in user's own CVs + subscriptions. Guarded as a whole — no public
// route here. Ownership is enforced in the service (every query is userId-scoped).
@Controller("me")
@UseGuards(JwtAuthGuard)
@ApiTags("account")
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: "Missing or invalid Bearer token.",
  type: ApiErrorResponseDto,
})
export class MeController {
  constructor(private readonly me: MeService) {}

  @Delete()
  @ApiOperation({ summary: "Delete the current account and its owned application data" })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiNotFoundResponse({ description: "Account was not found.", type: ApiErrorResponseDto })
  async deleteAccount(@CurrentUser() user: JwtUser): Promise<{ ok: true }> {
    if (!(await this.me.deleteAccount(user.userId))) throw new NotFoundException();
    return { ok: true };
  }

  @Get("cv")
  @ApiOperation({ summary: "List CVs claimed by the current account" })
  @ApiOkResponse({ description: "Current account CV links." })
  listCvs(@CurrentUser() user: JwtUser): Promise<MeCv[]> {
    return this.me.listCvs(user.userId);
  }

  @Delete("cv/:id")
  @ApiOperation({ summary: "Delete one account CV and its derived data" })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiNotFoundResponse({ description: "CV link was not found.", type: ApiErrorResponseDto })
  async deleteCv(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    if (!(await this.me.deleteCv(user.userId, id))) throw new NotFoundException();
    return { ok: true };
  }

  @Get("subscriptions")
  @ApiOperation({ summary: "List the current account Telegram subscriptions" })
  @ApiOkResponse({ description: "Current account subscriptions." })
  listSubscriptions(@CurrentUser() user: JwtUser): Promise<MeSubscription[]> {
    return this.me.listSubscriptions(user.userId);
  }

  @Patch("subscriptions/:id")
  @ApiOperation({ summary: "Enable or disable one current-account subscription" })
  @ApiBody({ type: UpdateSubscriptionStateDto })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiBadRequestResponse({ description: "isActive must be boolean.", type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ description: "Subscription was not found.", type: ApiErrorResponseDto })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async patchSubscription(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateSubscriptionStateDto,
  ): Promise<{ ok: true }> {
    if (!(await this.me.setSubscriptionActive(user.userId, id, body.isActive))) {
      throw new NotFoundException();
    }
    return { ok: true };
  }

  @Delete("subscriptions/:id")
  @ApiOperation({ summary: "Delete one current-account subscription" })
  @ApiOkResponse({ type: OkResponseDto })
  @ApiNotFoundResponse({ description: "Subscription was not found.", type: ApiErrorResponseDto })
  async deleteSubscription(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    if (!(await this.me.deleteSubscription(user.userId, id))) {
      throw new NotFoundException();
    }
    return { ok: true };
  }
}
