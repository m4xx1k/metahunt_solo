import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { AdminOnly } from "../auth/decorators/admin-only.decorator";

import { ApiErrorResponseDto } from "./api-error.dto";

/** Marks a controller as an authenticated administrator-only operational API. */
export function OperatorApi(tag: string) {
  return applyDecorators(
    AdminOnly(),
    ApiTags(tag),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      description: "Missing or invalid Bearer token.",
      type: ApiErrorResponseDto,
    }),
    ApiForbiddenResponse({
      description: "Authenticated user is not an administrator.",
      type: ApiErrorResponseDto,
    }),
  );
}
