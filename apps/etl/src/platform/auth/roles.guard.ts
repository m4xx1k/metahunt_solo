import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { RequestWithUser } from "./auth.types";
import { IS_PUBLIC_KEY } from "./decorators/public.decorator";
import { ROLES_KEY } from "./decorators/roles.decorator";

// Role gate. Contract: MUST run after JwtAuthGuard (which sets request.user and
// 401s unauthenticated requests) — the order in @UseGuards(JwtAuthGuard,
// RolesGuard) is load-bearing. Fail-closed: a guarded route with no @Roles is
// denied; mark genuinely open routes @Public().
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const roles = this.reflector.getAllAndMerge<string[]>(ROLES_KEY, [
      context.getClass(),
      context.getHandler(),
    ]);
    if (!roles.length) return false;

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user || !Array.isArray(user.roles)) return false;
    return user.roles.some((role) => roles.includes(role));
  }
}
