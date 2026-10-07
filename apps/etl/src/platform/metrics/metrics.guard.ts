import { createHash, timingSafeEqual } from "node:crypto";

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class MetricsAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredToken = this.config.get<string>("METRICS_TOKEN");
    const isProduction = this.config.get<string>("NODE_ENV") === "production";

    // If METRICS_TOKEN is not configured:
    // In production, strictly reject to prevent accidental exposure of telemetry and AI costs.
    // In local dev/test environments, allow unauthenticated scraping for zero-friction setup.
    if (!requiredToken || requiredToken.trim() === "") {
      if (isProduction) {
        throw new UnauthorizedException(
          "Metrics endpoint is disabled in production without METRICS_TOKEN",
        );
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();

    const rawHeader = request.headers.authorization;
    const authHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or malformed Authorization header for /metrics");
    }

    const providedToken = authHeader.slice(7).trim();

    // Constant-time comparison using fixed-length SHA-256 digests to prevent timing attacks
    // and avoid RangeError on unequal buffer lengths.
    const requiredHash = createHash("sha256").update(requiredToken).digest();
    const providedHash = createHash("sha256").update(providedToken).digest();

    if (!timingSafeEqual(requiredHash, providedHash)) {
      throw new UnauthorizedException("Invalid metrics bearer token");
    }

    return true;
  }
}
