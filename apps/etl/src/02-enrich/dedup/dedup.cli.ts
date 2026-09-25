/**
 * Standalone CLI for the dedup pipeline. Boots a minimal Nest application
 * context (Config + Database + Dedup only) — no Temporal workers, no HTTP.
 *
 *   embed [--force]                     embed new / changed vacancies
 *   resolve                             one sweep over pending vacancies
 *   plan [--out <dir>]                  read-only full rebuild → summary.md, target.json, current.json
 *   apply --partition <file>            write a plan file in one transaction (current.json = rollback)
 *
 * Writing commands print the target database and refuse a non-local one
 * without --yes-prod. Wrapped by the `dedup:*` scripts at the repo root.
 */

import "reflect-metadata";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { DatabaseModule } from "@metahunt/database";

import { assertWritableDbTarget, describeDbTarget } from "../../platform/config/db-target";
import { validateEnv } from "../../platform/config/env.validation";

import { DedupService, type PartitionFile } from "./dedup.service";
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

const COMMANDS = ["embed", "resolve", "plan", "apply"] as const;
type Command = (typeof COMMANDS)[number];
const USAGE =
  "Usage: dedup-cli <embed [--force] | resolve | plan [--out <dir>] | apply --partition <file>> [--yes-prod]";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0] as Command;
  if (!COMMANDS.includes(cmd)) {
    console.error(USAGE);
    process.exit(2);
  }

  const target = describeDbTarget(process.env.DATABASE_URL);
  console.log(`target: ${target.label}`);
  assertWritableDbTarget(target, {
    write: cmd !== "plan",
    acknowledged: argv.includes("--yes-prod"),
  });

  const partitionPath = cmd === "apply" ? flag(argv, "--partition") : null;
  if (cmd === "apply" && !partitionPath) {
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
      const r = await service.embedAll({ force: argv.includes("--force") });
      logger.log(
        `embed done in ${ms(Date.now() - t0)} — processed=${r.processed} embedded=${r.embedded} skipped=${r.skipped}`,
      );
    } else if (cmd === "resolve") {
      const r = await service.resolveAll();
      logger.log(
        `resolve done in ${ms(Date.now() - t0)} — processed=${r.processed} resolved=${r.resolved} ` +
          `stale=${r.stale} same_source_violations=${r.sameSourceViolations}`,
      );
    } else if (cmd === "plan") {
      const out = flag(argv, "--out") ?? defaultPlanDir();
      const plan = await service.plan();
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, "summary.md"), plan.report.markdown);
      writeFileSync(join(out, "target.json"), JSON.stringify(plan.target));
      writeFileSync(join(out, "current.json"), JSON.stringify(plan.current));
      const s = plan.report.stats;
      logger.log(
        `plan done in ${ms(Date.now() - t0)} → ${out} — groups ${s.groupsBefore}→${s.groupsAfter}, ` +
          `changed=${s.diff.changedGroups} splits=${s.diff.splits} merges=${s.diff.merges} moved=${s.diff.moved}, ` +
          `violations ${s.sameSourceViolationsBefore}→${s.sameSourceViolationsAfter}, ` +
          `newly digest-eligible=${s.newlyDigestEligible}`,
      );
    } else {
      const file = JSON.parse(readFileSync(partitionPath!, "utf8")) as PartitionFile;
      const r = await service.apply(file);
      logger.log(
        `apply (${file.kind}, built ${file.builtAt}) done in ${ms(Date.now() - t0)} — written=${r.written}`,
      );
    }
  } finally {
    await app.close();
  }
}

function flag(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}

function defaultPlanDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(".private", "dedup-rebuild", `plan-${stamp}`);
}

function ms(d: number): string {
  if (d < 1000) return `${d}ms`;
  if (d < 60_000) return `${(d / 1000).toFixed(1)}s`;
  const m = Math.floor(d / 60_000);
  const s = Math.floor((d % 60_000) / 1000);
  return `${m}m${s}s`;
}

void main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
