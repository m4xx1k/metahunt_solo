import { resolve } from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TemporalModule } from "nestjs-temporal-core";

import { LOADER_ACTIVITIES } from "../loader/activities";
import { RSS_ACTIVITIES } from "../rss/activities";
import { appendTsLoaderRule } from "./webpack-workflow.hook";

@Module({
  imports: [
    TemporalModule.registerAsync({
      imports: [ConfigModule],
      // Global so HealthController (and anything else app-level) can inject
      // TemporalService without re-registering the worker here.
      isGlobal: true,
      // Library types `useFactory` as `(...args: unknown[]) => ...`, so we
      // unpack the injected ConfigService manually.
      useFactory: (...args: unknown[]) => {
        const [config] = args as [ConfigService];
        // Temporal Cloud (API-key mode) requires `tls: true` + `apiKey`.
        // Local dev: TEMPORAL_API_KEY="" → plaintext to localhost:7233.
        const apiKey = config.get<string>("TEMPORAL_API_KEY") ?? "";
        const cloud = apiKey.length > 0;
        return {
          connection: {
            address: config.get<string>("TEMPORAL_ADDRESS")!,
            namespace: config.get<string>("TEMPORAL_NAMESPACE"),
            ...(cloud ? { tls: true, apiKey } : {}),
          },
          taskQueue: config.get<string>("TEMPORAL_TASK_QUEUE"),
          worker: {
            // Aggregated barrel: each feature module re-exports its workflows
            // from src/workflows/index.ts so the worker bundles everything
            // from one entry point.
            workflowsPath: resolve(__dirname, "../workflows"),
            bundlerOptions: { webpackConfigHook: appendTsLoaderRule },
            activityClasses: [...RSS_ACTIVITIES, ...LOADER_ACTIVITIES],
            // Worker spawns a Temporal connection; in `NODE_ENV=test` the
            // AppModule smoke spec compiles the graph without a running server.
            autoStart: config.get<string>("NODE_ENV") !== "test",
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class TemporalInfraModule {}
