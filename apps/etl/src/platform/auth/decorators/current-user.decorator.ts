import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import type { JwtUser, RequestWithUser } from "../auth.types";

// Pulls the JwtUser that JwtAuthGuard attached to the request. Only valid on
// routes behind JwtAuthGuard.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    return req.user as JwtUser;
  },
);
