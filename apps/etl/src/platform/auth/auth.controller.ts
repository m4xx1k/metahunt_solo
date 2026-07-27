import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { ApiErrorResponseDto, OkResponseDto } from "../swagger/api-error.dto";

import type {
  AuthUser,
  TelegramLoginPollRequest,
  TelegramLoginPollResponse,
  TelegramLoginRequest,
  TelegramLoginResponse,
  TelegramLoginStartResponse,
} from "./auth.contract";
import { AuthService } from "./auth.service";
import {
  AuthUserDto,
  TelegramLoginPollRequestDto,
  TelegramLoginPollResponseDto,
  TelegramLoginRequestDto,
  TelegramLoginResponseDto,
  TelegramLoginStartResponseDto,
} from "./auth.swagger.dto";
import type { JwtUser } from "./auth.types";
import { CurrentUser } from "./decorators/current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { TelegramLoginService } from "./telegram-login.service";

const TELEGRAM_LOGIN_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
const TELEGRAM_POLL_THROTTLE = { default: { limit: 600, ttl: 60_000 } };

@Controller("auth")
@ApiTags("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly telegramLogin: TelegramLoginService,
  ) {}

  @Post("telegram/start")
  @ApiOperation({ summary: "Begin the Telegram deep-link login handshake" })
  @ApiOkResponse({ type: TelegramLoginStartResponseDto })
  @Throttle(TELEGRAM_LOGIN_THROTTLE)
  async telegramStart(): Promise<TelegramLoginStartResponse> {
    return this.telegramLogin.start();
  }

  // One browser polls ~30x/min for the request's 5-minute life, so the bucket
  // has to hold several people behind one NAT. The poll secret, not the rate
  // limit, is what guards the session.
  @Post("telegram/poll")
  @Throttle(TELEGRAM_POLL_THROTTLE)
  @ApiOperation({ summary: "Collect the session once the bot has authorized it" })
  @ApiBody({ type: TelegramLoginPollRequestDto })
  @ApiOkResponse({ type: TelegramLoginPollResponseDto })
  @ApiBadRequestResponse({ description: "Malformed poll body.", type: ApiErrorResponseDto })
  async telegramPoll(
    @Body() body: Partial<TelegramLoginPollRequest>,
  ): Promise<TelegramLoginPollResponse> {
    const { nonce, pollSecret } = body ?? {};
    if (typeof nonce !== "string" || typeof pollSecret !== "string") {
      throw new BadRequestException("nonce and pollSecret are required");
    }
    return this.telegramLogin.poll(nonce, pollSecret);
  }

  @Post("telegram")
  @ApiOperation({ summary: "Verify Telegram login and return a Bearer session" })
  @ApiBody({ type: TelegramLoginRequestDto })
  @ApiOkResponse({ type: TelegramLoginResponseDto })
  @ApiBadRequestResponse({ description: "Malformed Telegram payload.", type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({
    description: "Telegram verification failed.",
    type: ApiErrorResponseDto,
  })
  @Throttle(TELEGRAM_LOGIN_THROTTLE)
  async telegram(@Body() body: Partial<TelegramLoginRequest>): Promise<TelegramLoginResponse> {
    const tg = body?.telegram;
    if (
      !tg ||
      typeof tg !== "object" ||
      typeof tg.id === "undefined" ||
      typeof tg.hash !== "string"
    ) {
      throw new BadRequestException("telegram payload is required");
    }
    return this.auth.loginTelegram(tg);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Resolve the current Bearer session" })
  @ApiBearerAuth()
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({
    description: "Missing, invalid, or stale token.",
    type: ApiErrorResponseDto,
  })
  async me(@CurrentUser() user: JwtUser): Promise<AuthUser> {
    const me = await this.auth.getMe(user.userId);
    if (!me) throw new UnauthorizedException("user not found");
    return me;
  }

  // Bearer tokens are stateless — logout is a client-side token drop. This ack
  // gives the client one endpoint to call (and a seam for future revocation).
  @Post("logout")
  @ApiOperation({ summary: "Acknowledge client-side logout" })
  @ApiOkResponse({ type: OkResponseDto })
  logout(): { ok: true } {
    return { ok: true };
  }
}
