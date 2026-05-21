/**
 * Standalone CLI for the dedup pipeline. Boots a minimal Nest
 * application context (Config + Database + Dedup only) so we can run
 * `embed` / `resolve` / `reset` without spinning up Temporal workers
 * or the HTTP server.
 *
 * Usage (after `pnpm --filter @metahunt/etl build`):
 *   node dist/dedup/dedup.cli.js embed
 *   node dist/dedup/dedup.cli.js resolve
 *   node dist/dedup/dedup.cli.js reset
 *   node dist/dedup/dedup.cli.js embed --force      # ignore hash cache
 *
 * Wrapped by the `dedup:*` npm scripts at the repo root.
 */

import "reflect-metadata";

import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { DatabaseModule } from "@metahunt/database";

import { validateEnv } from "../config/env.validation";
import { DedupService } from "./dedup.service";
import { OpenAIEmbeddingsClient } from "./openai-embeddings.client";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    DatabaseModule.forRoot(),
  ],
  providers: [OpenAIEmbeddingsClient, DedupService],
})
class DedupCliModule {}

const USAGE = "Usage: dedup-cli <embed|resolve|reset> [--force]";

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const force = process.argv.includes("--force");

  if (!cmd || !["embed", "resolve", "reset"].includes(cmd)) {
    console.error(USAGE);
    process.exit(2);
  }

  const logger = new Logger("dedup-cli");
  const app = await NestFactory.createApplicationContext(DedupCliModule, {
    logger: ["log", "warn", "error"],
  });

  try {
    const service = app.get(DedupService);
    const t0 = Date.now();
    if (cmd === "embed") {
      const r = await service.embedAll({ force });
      logger.log(
        `embed done in ${ms(Date.now() - t0)} — processed=${r.processed} embedded=${r.embedded} skipped=${r.skipped}`,
      );
    } else if (cmd === "resolve") {
      const r = await service.resolveAll();
      logger.log(
        `resolve done in ${ms(Date.now() - t0)} — processed=${r.processed} assigned=${r.assigned}`,
      );
    } else {
      await service.resetAll();
      logger.log(`reset done in ${ms(Date.now() - t0)}`);
    }
  } finally {
    await app.close();
  }
}

function ms(d: number): string {
  if (d < 1000) return `${d}ms`;
  if (d < 60_000) return `${(d / 1000).toFixed(1)}s`;
  const m = Math.floor(d / 60_000);
  const s = Math.floor((d % 60_000) / 1000);
  return `${m}m${s}s`;
}

void main().catch((err) => {
  // Surface as plain text so npm scripts show it directly.
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
