import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { ApiBadRequestResponse, ApiCreatedResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { ApiErrorResponseDto } from "../../platform/swagger/api-error.dto";

import {
  ALLOWED_SIGNUP_SOURCES,
  EMAIL_MAX_LENGTH,
  EMAIL_REGEX,
  type SubscribeRequest,
  type SubscribeResponse,
} from "./users.contract";
import { UsersService } from "./users.service";

@Controller("users")
@ApiTags("waitlist")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post("subscribe")
  @ApiOperation({ summary: "Create or acknowledge a waitlist subscription" })
  @ApiCreatedResponse({ description: "Subscription was created or already existed." })
  @ApiBadRequestResponse({ description: "Invalid email or source.", type: ApiErrorResponseDto })
  async subscribe(@Body() body: Partial<SubscribeRequest>): Promise<SubscribeResponse> {
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!email) {
      throw new BadRequestException("email is required");
    }
    if (email.length > EMAIL_MAX_LENGTH) {
      throw new BadRequestException(`email must be ≤ ${EMAIL_MAX_LENGTH} characters`);
    }
    if (!EMAIL_REGEX.test(email)) {
      throw new BadRequestException("email format is invalid");
    }

    const source = body?.source;
    if (!source || !ALLOWED_SIGNUP_SOURCES.includes(source)) {
      throw new BadRequestException(`source must be one of: ${ALLOWED_SIGNUP_SOURCES.join(", ")}`);
    }

    return this.users.subscribe(email, source);
  }
}
