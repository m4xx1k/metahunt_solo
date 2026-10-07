import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Request, Response } from "express";
import { of, throwError } from "rxjs";

import { MetricsService } from "./metrics.service";
import { MetricsController } from "./metrics.controller";
import { MetricsAuthGuard } from "./metrics.guard";
import { HttpMetricsInterceptor } from "./metrics.interceptor";

describe("Metrics Module", () => {
  describe("MetricsService", () => {
    let service: MetricsService;

    beforeEach(() => {
      service = new MetricsService();
      service.onModuleInit();
    });

    afterEach(() => {
      service.onModuleDestroy();
    });

    it("registers and exports Prometheus metrics", async () => {
      service.ingestRunsTotal.inc({ source: "djinni", status: "success" });
      service.extractionCostUsdTotal.inc({ model: "deepseek-v4-flash" }, 0.005);

      const output = await service.getMetrics();

      expect(output).toContain("metahunt_ingest_runs_total");
      expect(output).toContain('source="djinni"');
      expect(output).toContain("metahunt_extraction_cost_usd_total");
      expect(output).toContain("nodejs_eventloop_lag_seconds");
      expect(service.getContentType()).toContain("text/plain");
    });

    it("clears registry on module destroy", async () => {
      service.onModuleDestroy();
      const output = await service.getMetrics();
      expect(output.trim()).toBe("");
    });
  });

  describe("MetricsAuthGuard", () => {
    function createMockContext(authHeader?: string): ExecutionContext {
      return {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: authHeader },
          }),
        }),
      } as unknown as ExecutionContext;
    }

    it("allows request when METRICS_TOKEN is not configured in development", () => {
      const config = {
        get: jest.fn((key: string) => (key === "NODE_ENV" ? "development" : undefined)),
      } as unknown as ConfigService;
      const guard = new MetricsAuthGuard(config);

      expect(guard.canActivate(createMockContext())).toBe(true);
    });

    it("throws UnauthorizedException when METRICS_TOKEN is not configured in production", () => {
      const config = {
        get: jest.fn((key: string) => (key === "NODE_ENV" ? "production" : undefined)),
      } as unknown as ConfigService;
      const guard = new MetricsAuthGuard(config);

      expect(() => guard.canActivate(createMockContext())).toThrow(
        "Metrics endpoint is disabled in production without METRICS_TOKEN",
      );
    });

    it("throws UnauthorizedException when token is set but header is missing", () => {
      const config = {
        get: jest.fn((key: string) => (key === "METRICS_TOKEN" ? "secret-token" : "development")),
      } as unknown as ConfigService;
      const guard = new MetricsAuthGuard(config);

      expect(() => guard.canActivate(createMockContext())).toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException when token does not match (different length)", () => {
      const config = {
        get: jest.fn((key: string) => (key === "METRICS_TOKEN" ? "secret-token" : "development")),
      } as unknown as ConfigService;
      const guard = new MetricsAuthGuard(config);

      expect(() => guard.canActivate(createMockContext("Bearer short"))).toThrow(
        UnauthorizedException,
      );
    });

    it("throws UnauthorizedException when token does not match (same length)", () => {
      const config = {
        get: jest.fn((key: string) => (key === "METRICS_TOKEN" ? "secret-token" : "development")),
      } as unknown as ConfigService;
      const guard = new MetricsAuthGuard(config);

      expect(() => guard.canActivate(createMockContext("Bearer wrong-token"))).toThrow(
        UnauthorizedException,
      );
    });

    it("allows request when token matches", () => {
      const config = {
        get: jest.fn((key: string) => (key === "METRICS_TOKEN" ? "secret-token" : "development")),
      } as unknown as ConfigService;
      const guard = new MetricsAuthGuard(config);

      expect(guard.canActivate(createMockContext("Bearer secret-token"))).toBe(true);
    });
  });

  describe("HttpMetricsInterceptor", () => {
    let service: MetricsService;
    let interceptor: HttpMetricsInterceptor;

    beforeEach(() => {
      service = new MetricsService();
      interceptor = new HttpMetricsInterceptor(service);
    });

    afterEach(() => {
      service.onModuleDestroy();
    });

    function createMockHttpContext(
      req: Partial<Request>,
      res: Partial<Response>,
    ): ExecutionContext {
      return {
        getType: () => "http",
        switchToHttp: () => ({
          getRequest: () => req as Request,
          getResponse: () => res as Response,
        }),
      } as unknown as ExecutionContext;
    }

    it("skips /metrics and /metrics/ paths", (done) => {
      const context = createMockHttpContext({ path: "/metrics" }, { statusCode: 200 });
      const next: CallHandler = { handle: () => of({ ok: true }) };

      const observeSpy = jest.spyOn(service.httpRequestDurationSeconds, "observe");

      interceptor.intercept(context, next).subscribe(() => {
        expect(observeSpy).not.toHaveBeenCalled();
        done();
      });
    });

    it("records status code 200 for successful requests", (done) => {
      const req = {
        method: "GET",
        path: "/feed",
        baseUrl: "",
        route: { path: "/feed" },
      };
      const res = { statusCode: 200 };
      const context = createMockHttpContext(req, res);
      const next: CallHandler = { handle: () => of({ ok: true }) };

      const observeSpy = jest.spyOn(service.httpRequestDurationSeconds, "observe");

      interceptor.intercept(context, next).subscribe(() => {
        expect(observeSpy).toHaveBeenCalledWith(
          {
            method: "GET",
            route: "/feed",
            status_code: "200",
          },
          expect.any(Number),
        );
        done();
      });
    });

    it("records status code 400 when BadRequestException is thrown", (done) => {
      const req = {
        method: "POST",
        path: "/auth/google",
        baseUrl: "",
        route: { path: "/auth/google" },
      };
      const res = { statusCode: 200 };
      const context = createMockHttpContext(req, res);
      const next: CallHandler = {
        handle: () => throwError(() => new BadRequestException("Invalid ID token")),
      };

      const observeSpy = jest.spyOn(service.httpRequestDurationSeconds, "observe");

      interceptor.intercept(context, next).subscribe({
        error: () => {
          expect(observeSpy).toHaveBeenCalledWith(
            {
              method: "POST",
              route: "/auth/google",
              status_code: "400",
            },
            expect.any(Number),
          );
          done();
        },
      });
    });

    it("records status code 404 when NotFoundException is thrown", (done) => {
      const req = {
        method: "GET",
        path: "/feed/vacancy/missing-id",
        baseUrl: "/feed",
        route: { path: "/vacancy/:id" },
      };
      const res = { statusCode: 200 };
      const context = createMockHttpContext(req, res);
      const next: CallHandler = {
        handle: () => throwError(() => new NotFoundException("Vacancy not found")),
      };

      const observeSpy = jest.spyOn(service.httpRequestDurationSeconds, "observe");

      interceptor.intercept(context, next).subscribe({
        error: () => {
          expect(observeSpy).toHaveBeenCalledWith(
            {
              method: "GET",
              route: "/feed/vacancy/:id",
              status_code: "404",
            },
            expect.any(Number),
          );
          done();
        },
      });
    });

    it("records status code 500 when an unhandled error is thrown", (done) => {
      const req = {
        method: "GET",
        path: "/crash",
        baseUrl: "",
        route: { path: "/crash" },
      };
      const res = { statusCode: 200 };
      const context = createMockHttpContext(req, res);
      const next: CallHandler = {
        handle: () => throwError(() => new Error("Database offline")),
      };

      const observeSpy = jest.spyOn(service.httpRequestDurationSeconds, "observe");

      interceptor.intercept(context, next).subscribe({
        error: () => {
          expect(observeSpy).toHaveBeenCalledWith(
            {
              method: "GET",
              route: "/crash",
              status_code: "500",
            },
            expect.any(Number),
          );
          done();
        },
      });
    });
  });

  describe("MetricsController", () => {
    it("returns formatted metrics and sets content-type", async () => {
      const metricsService = new MetricsService();
      metricsService.onModuleInit();
      const controller = new MetricsController(metricsService);

      const setHeader = jest.fn();
      const mockRes = { setHeader } as unknown as Response;

      const body = await controller.getMetrics(mockRes);

      expect(setHeader).toHaveBeenCalledWith("Content-Type", metricsService.getContentType());
      expect(typeof body).toBe("string");
      expect(body).toContain("nodejs_eventloop_lag_seconds");

      metricsService.onModuleDestroy();
    });
  });
});
