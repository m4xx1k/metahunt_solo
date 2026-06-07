import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "@metahunt/database";
import { AppController } from "./app.controller";
import { validateEnv } from "./platform/config/env.validation";
import { AnalyticsModule } from "./platform/analytics/analytics.module";
import { DedupModule } from "./02-enrich/dedup/dedup.module";
import { ExtractionCostModule } from "./02-enrich/extraction-cost/extraction-cost.module";
import { HealthController } from "./platform/health/health.controller";
import { LoaderModule } from "./02-enrich/loader/loader.module";
import { MonitoringModule } from "./admin/monitoring/monitoring.module";
import { RssModule } from "./01-ingest/rss/rss.module";
import { StorageModule } from "./platform/storage/storage.module";
import { TaxonomyModule } from "./admin/taxonomy/taxonomy.module";
import { FeedModule } from "./03-discovery/feed/feed.module";
import { MarketModule } from "./03-discovery/market/market.module";
import { RankingModule } from "./03-discovery/ranking/ranking.module";
import { CvModule } from "./03-discovery/cv/cv.module";
import { TemporalInfraModule } from "./platform/temporal/temporal.module";
import { TracksModule } from "./03-discovery/tracks/tracks.module";
import { UsersModule } from "./04-notify/users/users.module";
import { TelegramModule } from "./04-notify/telegram/telegram.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    DatabaseModule.forRoot(),
    AnalyticsModule,
    TemporalInfraModule,
    StorageModule,
    RssModule,
    LoaderModule,
    TaxonomyModule,
    MonitoringModule,
    FeedModule,
    TracksModule,
    MarketModule,
    RankingModule,
    CvModule,
    DedupModule,
    ExtractionCostModule,
    UsersModule,
    TelegramModule,
  ],
  controllers: [AppController, HealthController],
})
export class AppModule {}
