import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "@metahunt/database";
import { AppController } from "./app.controller";
import { validateEnv } from "./config/env.validation";
import { DedupModule } from "./dedup/dedup.module";
import { ExtractionCostModule } from "./extraction-cost/extraction-cost.module";
import { HealthController } from "./health/health.controller";
import { LoaderModule } from "./loader/loader.module";
import { MonitoringModule } from "./monitoring/monitoring.module";
import { RssModule } from "./rss/rss.module";
import { StorageModule } from "./storage/storage.module";
import { TaxonomyModule } from "./taxonomy/taxonomy.module";
import { FeedModule } from "./feed/feed.module";
import { MarketModule } from "./market/market.module";
import { TemporalInfraModule } from "./temporal/temporal.module";
import { TracksModule } from "./tracks/tracks.module";
import { UsersModule } from "./users/users.module";
import { TelegramModule } from "./telegram/telegram.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    DatabaseModule.forRoot(),
    TemporalInfraModule,
    StorageModule,
    RssModule,
    LoaderModule,
    TaxonomyModule,
    MonitoringModule,
    FeedModule,
    TracksModule,
    MarketModule,
    DedupModule,
    ExtractionCostModule,
    UsersModule,
    TelegramModule,
  ],
  controllers: [AppController, HealthController],
})
export class AppModule {}
