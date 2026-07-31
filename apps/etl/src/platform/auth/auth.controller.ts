import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
  AccountMergeStartResponse,
  AuthUser,
  ConfirmAccountMergeRequest,
  GoogleLoginRequest,
  TelegramLoginPollRequest,
  TelegramLoginPollResponse,
  TelegramLoginResponse,
  TelegramLoginStartResponse,
} from "./auth.contract";
import { AuthService } from "./auth.service";
import {
  AccountMergeStartResponseDto,
  AuthUserDto,
  ConfirmAccountMergeRequestDto,
  GoogleLoginRequestDto,
  TelegramLoginPollRequestDto,
  TelegramLoginPollResponseDto,
  TelegramLoginResponseDto,
  TelegramLoginStartResponseDto,
} from "./auth.swagger.dto";
import type { JwtUser } from "./auth.types";
import { CurrentUser } from "./decorators/current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { TelegramLoginService } from "./telegram-login.service";

const TELEGRAM_LOGIN_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
const TELEGRAM_POLL_THROTTLE = { default: { limit: 600, ttl: 60_000 } };
const ACCOUNT_MERGE_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

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

  @Post("google")
  @ApiOperation({ summary: "Verify a Google ID token and return a Bearer session" })
  @ApiBody({ type: GoogleLoginRequestDto })
  @ApiOkResponse({ type: TelegramLoginResponseDto })
  @ApiUnauthorizedResponse({
    description: "Google verification failed.",
    type: ApiErrorResponseDto,
  })
  @Throttle(TELEGRAM_LOGIN_THROTTLE)
  async google(@Body() body: Partial<GoogleLoginRequest>): Promise<TelegramLoginResponse> {
    if (typeof body?.credential !== "string" || body.credential.length === 0) {
      throw new BadRequestException("credential is required");
    }
    return this.auth.loginGoogle(body.credential);
  }

  @Post("link/google")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Attach a Google account to the current session" })
  @ApiBearerAuth()
  @ApiBody({ type: GoogleLoginRequestDto })
  @ApiOkResponse({ type: AuthUserDto })
  @Throttle(TELEGRAM_LOGIN_THROTTLE)
  async linkGoogle(
    @CurrentUser() user: JwtUser,
    @Body() body: Partial<GoogleLoginRequest>,
  ): Promise<AuthUser> {
    if (typeof body?.credential !== "string" || body.credential.length === 0) {
      throw new BadRequestException("credential is required");
    }
    await this.auth.linkGoogleTo(user.userId, body.credential);
    return this.requireMe(user.userId);
  }

  @Post("merge/start")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Create a one-time code for a two-session account merge" })
  @ApiBearerAuth()
  @ApiOkResponse({ type: AccountMergeStartResponseDto })
  @Throttle(ACCOUNT_MERGE_THROTTLE)
  async startAccountMerge(@CurrentUser() user: JwtUser): Promise<AccountMergeStartResponse> {
    const result = await this.auth.startAccountMerge(user.userId);
    return { code: result.code, expiresAt: result.expiresAt.toISOString() };
  }

  @Post("merge/confirm")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Merge the account that created a one-time code into the current account",
  })
  @ApiBearerAuth()
  @ApiBody({ type: ConfirmAccountMergeRequestDto })
  @ApiOkResponse({ type: AuthUserDto })
  @Throttle(ACCOUNT_MERGE_THROTTLE)
  async confirmAccountMerge(
    @CurrentUser() user: JwtUser,
    @Body() body: Partial<ConfirmAccountMergeRequest>,
  ): Promise<AuthUser> {
    if (typeof body?.code !== "string") throw new BadRequestException("code is required");
    await this.auth.confirmAccountMerge(user.userId, body.code);
    return this.requireMe(user.userId);
  }

  @Post("link/telegram/start")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Begin linking a Telegram account to the current session" })
  @ApiBearerAuth()
  @ApiOkResponse({ type: TelegramLoginStartResponseDto })
  @Throttle(TELEGRAM_LOGIN_THROTTLE)
  async startTelegramLink(@CurrentUser() user: JwtUser): Promise<TelegramLoginStartResponse> {
    return this.telegramLogin.start(user.userId);
  }

  @Delete("link/:provider")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Detach a sign-in method (never the last one)" })
  @ApiBearerAuth()
  @ApiOkResponse({ type: AuthUserDto })
  @ApiBadRequestResponse({ description: "Unknown or last provider.", type: ApiErrorResponseDto })
  async unlink(
    @CurrentUser() user: JwtUser,
    @Param("provider") provider: string,
  ): Promise<AuthUser> {
    if (provider !== "telegram" && provider !== "google") {
      throw new BadRequestException("unknown provider");
    }
    await this.auth.unlinkIdentity(user.userId, provider);
    return this.requireMe(user.userId);
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
    return this.requireMe(user.userId);
  }

  private async requireMe(userId: string): Promise<AuthUser> {
    const me = await this.auth.getMe(userId);
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
