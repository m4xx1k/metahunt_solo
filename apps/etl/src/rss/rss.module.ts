import { resolve } from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TemporalModule } from "nestjs-temporal-core";

import { ExtractionModule } from "../extraction/extraction.module";
import { StorageModule } from "../storage/storage.module";
import { RssFetchActivity } from "./activities/rss-fetch.activity";
import { RssParseActivity } from "./activities/rss-parse.activity";
import { RssExtractActivity } from "./activities/rss-extract.activity";
import { RssFinalizeActivity } from "./activities/rss-finalize.activity";
import { RssParserService } from "./rss-parser.service";
import { RssSchedulerService } from "./rss-scheduler.service";
import { RssController } from "./rss.controller";

@Module({
  imports: [
    StorageModule,
    ExtractionModule,
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
            workflowsPath: resolve(__dirname, "workflows"),
            bundlerOptions: {
              webpackConfigHook: (cfg: Record<string, unknown>) => {
                const mod = (cfg.module ?? {}) as Record<string, unknown>;
                const rules = (mod.rules ?? []) as unknown[];
                return {
                  ...cfg,
                  module: {
                    ...mod,
                    rules: [
                      ...rules,
                      {
                        test: /\.ts$/,
                        exclude: /node_modules/,
                        use: [
                          {
                            loader: require.resolve("ts-loader"),
                            options: { transpileOnly: true },
                          },
                        ],
                      },
                    ],
                  },
                };
              },
            },
            activityClasses: [
              RssFetchActivity,
              RssParseActivity,
              RssExtractActivity,
              RssFinalizeActivity,
            ],
            // Worker spawns a Temporal connection; in `NODE_ENV=test` the
            // AppModule smoke spec compiles the graph without a running server.
            autoStart: config.get<string>("NODE_ENV") !== "test",
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [
    RssParserService,
    RssFetchActivity,
    RssParseActivity,
    RssExtractActivity,
    RssFinalizeActivity,
    RssSchedulerService,
  ],
  controllers: [RssController],
})
export class RssModule {}
