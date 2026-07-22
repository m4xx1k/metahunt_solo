import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { DatabaseModule } from "@metahunt/database";

import { RssModule } from "./01-ingest/rss/rss.module";
import { DedupModule } from "./02-enrich/dedup/dedup.module";
import { ExtractionCostModule } from "./02-enrich/extraction-cost/extraction-cost.module";
import { LoaderModule } from "./02-enrich/loader/loader.module";
import { CvModule } from "./03-discovery/cv/cv.module";
import { FeedModule } from "./03-discovery/feed/feed.module";
import { MarketModule } from "./03-discovery/market/market.module";
import { RankingModule } from "./03-discovery/ranking/ranking.module";
import { TracksModule } from "./03-discovery/tracks/tracks.module";
import { TelegramModule } from "./04-notify/telegram/telegram.module";
import { UsersModule } from "./04-notify/users/users.module";
import { AccountModule } from "./account/account.module";
import { MonitoringModule } from "./admin/monitoring/monitoring.module";
import { ProductAnalyticsModule } from "./admin/product-analytics/product-analytics.module";
import { TaxonomyModule } from "./admin/taxonomy/taxonomy.module";
import { AppController } from "./app.controller";
import { AnalyticsModule } from "./platform/analytics/analytics.module";
import { AuthModule } from "./platform/auth/auth.module";
import { validateEnv } from "./platform/config/env.validation";
import { HealthController } from "./platform/health/health.controller";
import { StorageModule } from "./platform/storage/storage.module";
import { TemporalInfraModule } from "./platform/temporal/temporal.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    // Global IP rate limit — a generous abuse backstop only. Kept high because
    // feed SSR calls all share the Vercel server IP; normal browsing must never
    // hit it. Expensive endpoints tighten it per-route via @Throttle (see
    // CvController — the LLM-backed /cv upload, 5/min per real browser IP).
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 300 }]),
    DatabaseModule.forRoot(),
    AnalyticsModule,
    AuthModule,
    TemporalInfraModule,
    StorageModule,
    RssModule,
    LoaderModule,
    TaxonomyModule,
    MonitoringModule,
    ProductAnalyticsModule,
    FeedModule,
    TracksModule,
    MarketModule,
    RankingModule,
    CvModule,
    DedupModule,
    ExtractionCostModule,
    UsersModule,
    TelegramModule,
    AccountModule,
  ],
  controllers: [AppController, HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
