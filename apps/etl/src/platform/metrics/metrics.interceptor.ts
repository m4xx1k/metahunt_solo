import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";

import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

import { MetricsService } from "./metrics.service";

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    // Skip scraping /metrics itself to prevent recursive skew
    if (req.path === "/metrics" || req.path === "/metrics/" || req.path.startsWith("/metrics/")) {
      return next.handle();
    }

    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.record(req, res, start),
        error: (err: unknown) => {
          const status =
            err instanceof HttpException
              ? err.getStatus()
              : typeof (err as { status?: unknown })?.status === "number"
                ? (err as { status: number }).status
                : 500;
          this.record(req, res, start, status);
        },
      }),
    );
  }

  private record(req: Request, res: Response, startBigInt: bigint, overrideStatus?: number): void {
    const elapsedSeconds = Number(process.hrtime.bigint() - startBigInt) / 1e9;
    const rawRoute = (req as unknown as { route?: { path?: unknown } }).route;
    const routePath = rawRoute && typeof rawRoute.path === "string" ? rawRoute.path : undefined;
    const baseUrl = req.baseUrl || "";
    const route =
      routePath !== undefined
        ? `${baseUrl}${routePath}` || "/"
        : req.path === "/"
          ? "/"
          : "unmatched";
    const statusCode = overrideStatus ?? res.statusCode ?? 200;

    this.metrics.httpRequestDurationSeconds.observe(
      {
        method: req.method,
        route,
        status_code: String(statusCode),
      },
      elapsedSeconds,
    );
  }
}
