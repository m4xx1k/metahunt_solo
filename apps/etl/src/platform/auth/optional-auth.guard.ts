import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { AuthService } from "./auth.service";
import type { JwtPayload, RequestWithUser } from "./auth.types";

// Like JwtAuthGuard, but a missing, malformed, expired or stale-account token
// means "anonymous visitor", not a 401 — for routes that personalize when a
// viewer is signed in but must stay open either way (the feed, vacancy
// detail). Never blocks the request; only ever adds `request.user`.
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return true;

    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(header.slice(7).trim());
    } catch {
      // Bad signature or expired token on an optional route: anonymous, not
      // a 401. Only verification is caught here — an AuthService failure
      // below still propagates, so a real outage surfaces as one, not as a
      // silently degraded anonymous response.
      return true;
    }

    const current = await this.auth.getMe(payload.sub);
    if (current) {
      req.user = { userId: payload.sub, telegramId: current.telegramId, roles: current.roles };
    }
    // A deleted/stale account (current === null) also falls back to
    // anonymous — unlike JwtAuthGuard, this route never required one.
    return true;
  }
}
