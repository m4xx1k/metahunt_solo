import { BadRequestException, Body, Controller, Post } from "@nestjs/common";

import {
  ALLOWED_SIGNUP_SOURCES,
  EMAIL_MAX_LENGTH,
  EMAIL_REGEX,
  type SignupSource,
  type SubscribeRequest,
  type SubscribeResponse,
} from "./users.contract";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post("subscribe")
  async subscribe(
    @Body() body: Partial<SubscribeRequest>,
  ): Promise<SubscribeResponse> {
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!email) {
      throw new BadRequestException("email is required");
    }
    if (email.length > EMAIL_MAX_LENGTH) {
      throw new BadRequestException(
        `email must be ≤ ${EMAIL_MAX_LENGTH} characters`,
      );
    }
    if (!EMAIL_REGEX.test(email)) {
      throw new BadRequestException("email format is invalid");
    }

    const source = body?.source;
    if (!source || !ALLOWED_SIGNUP_SOURCES.includes(source as SignupSource)) {
      throw new BadRequestException(
        `source must be one of: ${ALLOWED_SIGNUP_SOURCES.join(", ")}`,
      );
    }

    return this.users.subscribe(email, source as SignupSource);
  }
}
