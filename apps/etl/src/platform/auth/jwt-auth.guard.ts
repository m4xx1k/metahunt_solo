import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";

import { AuthService } from "./auth.service";
import type { JwtPayload, RequestWithUser } from "./auth.types";
import { IS_PUBLIC_KEY } from "./decorators/public.decorator";

// Authenticates a request from its `Authorization: Bearer <jwt>` header and
// attaches the decoded user as `request.user`. @Public() routes skip it.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("missing bearer token");
    }

    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(header.slice(7).trim());
    } catch {
      throw new UnauthorizedException("invalid token");
    }

    const current = await this.auth.getMe(payload.sub);
    if (!current) throw new UnauthorizedException("deleted or stale account");
    req.user = {
      userId: payload.sub,
      telegramId: current.telegramId,
      roles: current.roles,
    };
    return true;
  }
}
