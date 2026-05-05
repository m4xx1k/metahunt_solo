import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "@metahunt/database";
import { AppController } from "./app.controller";
import { validateEnv } from "./config/env.validation";
import { HealthController } from "./health/health.controller";
import { LoaderModule } from "./loader/loader.module";
import { MonitoringModule } from "./monitoring/monitoring.module";
import { RssModule } from "./rss/rss.module";
import { StorageModule } from "./storage/storage.module";
import { TemporalInfraModule } from "./temporal/temporal.module";

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
    MonitoringModule,
  ],
  controllers: [AppController, HealthController],
})
export class AppModule {}
