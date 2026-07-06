import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";

import { IS_PUBLIC_KEY } from "./decorators/public.decorator";
import type { JwtPayload, RequestWithUser } from "./auth.types";

// Authenticates a request from its `Authorization: Bearer <jwt>` header and
// attaches the decoded user as `request.user`. @Public() routes skip it.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
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

    try {
      const payload = this.jwt.verify<JwtPayload>(header.slice(7).trim());
      req.user = {
        userId: payload.sub,
        telegramId: payload.tid ?? null,
        roles: Array.isArray(payload.roles) ? payload.roles : [],
      };
      return true;
    } catch {
      throw new UnauthorizedException("invalid token");
    }
  }
}
