import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import type { JwtUser } from "../platform/auth/auth.types";
import { CurrentUser } from "../platform/auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../platform/auth/jwt-auth.guard";

import type { MeCv, MeSubscription } from "./me.contract";
import { MeService } from "./me.service";

// The logged-in user's own CVs + subscriptions. Guarded as a whole — no public
// route here. Ownership is enforced in the service (every query is userId-scoped).
@Controller("me")
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get("cv")
  listCvs(@CurrentUser() user: JwtUser): Promise<MeCv[]> {
    return this.me.listCvs(user.userId);
  }

  // Claim an anonymously-uploaded CV for the logged-in user so it persists to
  // the account (cross-device), not just this browser's localStorage.
  @Post("cv")
  async claimCv(
    @CurrentUser() user: JwtUser,
    @Body("candidateId", ParseUUIDPipe) candidateId: string,
  ): Promise<{ ok: true }> {
    await this.me.linkCv(user.userId, candidateId);
    return { ok: true };
  }

  @Delete("cv/:id")
  async deleteCv(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    if (!(await this.me.deleteCv(user.userId, id))) throw new NotFoundException();
    return { ok: true };
  }

  @Get("subscriptions")
  listSubscriptions(@CurrentUser() user: JwtUser): Promise<MeSubscription[]> {
    return this.me.listSubscriptions(user.userId);
  }

  @Patch("subscriptions/:id")
  async patchSubscription(
    @CurrentUser() user: JwtUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { isActive?: unknown },
  ): Promise<{ ok: true }> {
    if (typeof body?.isActive !== "boolean") {
      throw new BadRequestException("isActive must be a boolean");
    }
    if (!(await this.me.setSubscriptionActive(user.userId, id, body.isActive))) {
      throw new NotFoundException();
    }
    return { ok: true };
  }

  @Delete("subscriptions/:id")
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
