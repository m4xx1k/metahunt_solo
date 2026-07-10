/**
 * One-off backfill: classify VERIFIED SKILL nodes into `node_tech_meta` via the
 * BAML `ClassifySkills` function, so the recommendation gates have stack/category
 * metadata to work with. See md/journal/migrations/skill-metadata-recommendations.md
 * (Population) and the rubric the BAML prompt encodes (classify-rubric.md).
 *
 * Additive + idempotent: by default it classifies only skills with no row yet;
 * `--force` reclassifies all VERIFIED skills (upsert). Unclassified nodes degrade
 * gracefully — the gates treat a missing row as stack=null (safe no-op).
 *
 * Usage (wrapped by the `classify-skills` npm script at repo root):
 *   node apps/etl/dist/discovery/ranking/classify-skills.cli.js
 *   node apps/etl/dist/discovery/ranking/classify-skills.cli.js --force
 */

import "reflect-metadata";

import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { sql } from "drizzle-orm";

import { DRIZZLE, DatabaseModule, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { b } from "../../baml_client";
import { validateEnv } from "../../platform/config/env.validation";

import { TECH_STACKS } from "./ranking.contract";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    DatabaseModule.forRoot(),
  ],
})
class ClassifySkillsCliModule {}

const BATCH = 90; // ~80-100/call keeps the LLM output stable (rubric guidance)
const STACKS = new Set<string>(TECH_STACKS);

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const logger = new Logger("classify-skills");
  const app = await NestFactory.createApplicationContext(ClassifySkillsCliModule, {
    logger: ["log", "warn", "error"],
  });

  try {
    const db = app.get<DrizzleDB>(DRIZZLE);
    const t0 = Date.now();

    const { rows: skills } = await db.execute<{ node_id: string; name: string }>(sql`
      SELECT n.id::text AS node_id, n.canonical_name AS name
      FROM nodes n
      WHERE n.type = 'SKILL' AND n.status = 'VERIFIED'
        ${force ? sql`` : sql`AND NOT EXISTS (SELECT 1 FROM node_tech_meta m WHERE m.node_id = n.id)`}
      ORDER BY n.canonical_name
    `);

    if (skills.length === 0) {
      logger.log("nothing to classify (all VERIFIED skills already have meta)");
      return;
    }
    logger.log(`classifying ${skills.length} VERIFIED skill(s) in batches of ${BATCH}`);

    let upserted = 0;
    let coerced = 0; // off-vocab stacks coerced to null (conservative)
    for (let i = 0; i < skills.length; i += BATCH) {
      const batch = skills.slice(i, i + BATCH);
      const out = await b.ClassifySkills(batch.map((s) => ({ nodeId: s.node_id, name: s.name })));
      const byId = new Map(out.map((c) => [c.nodeId, c]));

      const values = batch.flatMap((s) => {
        const c = byId.get(s.node_id);
        if (!c) {
          logger.warn(`no classification returned for ${s.name} (${s.node_id})`);
          return [];
        }
        let stack = c.stack ?? null;
        if (stack !== null && !STACKS.has(stack)) {
          coerced += 1;
          stack = null;
        }
        return [
          {
            nodeId: s.node_id,
            category: c.category,
            stack,
            isCore: c.isCore,
            generic: c.generic,
          },
        ];
      });

      if (values.length > 0) {
        await db
          .insert(schema.nodeTechMeta)
          .values(values)
          .onConflictDoUpdate({
            target: schema.nodeTechMeta.nodeId,
            set: {
              category: sql`excluded.category`,
              stack: sql`excluded.stack`,
              isCore: sql`excluded.is_core`,
              generic: sql`excluded.generic`,
              classifiedAt: sql`now()`,
            },
          });
        upserted += values.length;
      }
      logger.log(`  ${Math.min(i + BATCH, skills.length)}/${skills.length} classified`);
    }

    logger.log(
      `done in ${ms(Date.now() - t0)} — upserted=${upserted} off-vocab-stacks-nulled=${coerced}`,
    );
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
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
