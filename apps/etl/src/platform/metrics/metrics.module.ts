import { Module, Global } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { MetricsController } from "./metrics.controller";
import { MetricsAuthGuard } from "./metrics.guard";
import { HttpMetricsInterceptor } from "./metrics.interceptor";
import { MetricsService } from "./metrics.service";

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    MetricsAuthGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
