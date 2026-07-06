import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import type {
  AuthUser,
  TelegramLoginRequest,
  TelegramLoginResponse,
} from "./auth.contract";
import type { JwtUser } from "./auth.types";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("telegram")
  async telegram(
    @Body() body: Partial<TelegramLoginRequest>,
  ): Promise<TelegramLoginResponse> {
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
  async me(@CurrentUser() user: JwtUser): Promise<AuthUser> {
    const me = await this.auth.getMe(user.userId);
    if (!me) throw new UnauthorizedException("user not found");
    return me;
  }

  // Bearer tokens are stateless — logout is a client-side token drop. This ack
  // gives the client one endpoint to call (and a seam for future revocation).
  @Post("logout")
  logout(): { ok: true } {
    return { ok: true };
  }
}
