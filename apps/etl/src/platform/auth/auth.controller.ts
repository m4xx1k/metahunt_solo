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

import { ApiErrorResponseDto, OkResponseDto } from "../swagger/api-error.dto";

import type { AuthUser, TelegramLoginRequest, TelegramLoginResponse } from "./auth.contract";
import { AuthService } from "./auth.service";
import { AuthUserDto, TelegramLoginRequestDto, TelegramLoginResponseDto } from "./auth.swagger.dto";
import type { JwtUser } from "./auth.types";
import { CurrentUser } from "./decorators/current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("auth")
@ApiTags("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("telegram")
  @ApiOperation({ summary: "Verify Telegram login and return a Bearer session" })
  @ApiBody({ type: TelegramLoginRequestDto })
  @ApiOkResponse({ type: TelegramLoginResponseDto })
  @ApiBadRequestResponse({ description: "Malformed Telegram payload.", type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({
    description: "Telegram verification failed.",
    type: ApiErrorResponseDto,
  })
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
    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds.filter((v): v is string => typeof v === "string")
      : [];
    return this.auth.loginTelegram(tg, candidateIds);
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
