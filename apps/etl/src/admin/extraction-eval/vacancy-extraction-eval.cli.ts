/*
 * Explicitly opt-in BAML evaluation. The default is a no-provider dry-run;
 * `--live` is intentionally blocked until reviewers approve every selected
 * case and declare both a call and USD limit.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { Collector } from "@boundaryml/baml";
import { Pool } from "pg";

import {
  BAML_PRODUCTION_SOURCE_HASH,
  BAML_RUNTIME_VERSION,
} from "../../02-enrich/extraction/baml-production-identity.generated";
import {
  goldenSetSchema,
  type GoldenSetCase,
} from "../../02-enrich/extraction/eval/golden-set.schema";
import {
  assertExpectedRolesAreVerified,
  assertLiveLimits,
  buildEvaluationPlan,
  summarizeEvaluation,
} from "../../02-enrich/extraction/eval/vacancy-extraction-eval";
import {
  buildVacancyExtractionSpecHash,
  hashVerifiedTaxonomy,
} from "../../02-enrich/extraction/extraction-identity";
import { MODEL_PRICING_USD_PER_MTOK } from "../../02-enrich/extraction/pricing";
import { b } from "../../baml_client";
import { joinNamesByType } from "../../platform/shared/node-names";

type Taxonomy = { roles: string; domains: string; skills: string; taxonomyHash: string };
type Usage = { in: number; out: number; cached: number; ms: number | null };
type Run = {
  actual: { isTech: boolean; role: string | null; seniority: string | null };
  usage: Usage;
  costUsd: number;
};

async function main(): Promise<void> {
  const live = process.argv.includes("--live");
  const runs = intValue("--runs", 3);
  const datasetPath = resolve(
    value("--dataset") ?? "apps/etl/src/02-enrich/extraction/eval/golden-set.role-contract.v1.json",
  );
  const rawDataset = await readFile(datasetPath, "utf8");
  const dataset = goldenSetSchema.parse(JSON.parse(rawDataset));
  const plan = buildEvaluationPlan(dataset, runs);
  const datasetHash = createHash("sha256").update(rawDataset).digest("hex");

  if (!live) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          datasetPath,
          datasetHash,
          contract: dataset.contract,
          taxonomySource: dataset.taxonomySource,
          ...plan,
          note: "No provider call or database query was made.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const maxCalls = intValue("--max-calls");
  const maxCostUsd = numberValue("--max-cost-usd");
  assertLiveLimits(plan, maxCalls, maxCostUsd);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for --live taxonomy snapshot");
  if (!process.env.DEEPSEEK_API_KEY || !process.env.DEEPSEEK_MODEL) {
    throw new Error("DEEPSEEK_API_KEY and DEEPSEEK_MODEL are required for --live");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const taxonomy = await loadTaxonomy(pool);
    assertExpectedRolesAreVerified(dataset, taxonomy.roles.split(", ").filter(Boolean));
    const model = process.env.DEEPSEEK_MODEL;
    const specHash = buildVacancyExtractionSpecHash({
      bamlSourceHash: BAML_PRODUCTION_SOURCE_HASH,
      bamlVersion: BAML_RUNTIME_VERSION,
      provider: "openai-generic",
      model,
      taxonomyHash: taxonomy.taxonomyHash,
    });
    let spentUsd = 0;
    const cases = [] as Array<{ id: string; expected: GoldenSetCase["expected"]; runs: Run[] }>;
    for (const item of dataset.cases.filter((candidate) => candidate.reviewStatus === "approved")) {
      const itemRuns: Run[] = [];
      for (let attempt = 0; attempt < runs; attempt++) {
        if (spentUsd >= maxCostUsd) {
          throw new Error(`cost ceiling reached before call ${item.id}#${attempt + 1}`);
        }
        const collector = new Collector("vacancy-role-contract-eval");
        const data = await b.ExtractVacancy(
          item.text,
          taxonomy.roles,
          taxonomy.domains,
          taxonomy.skills,
          {
            collector,
          },
        );
        const usage = readUsage(collector);
        const costUsd = estimateCost(model, usage);
        spentUsd += costUsd;
        itemRuns.push({
          actual: {
            isTech: data.isTech,
            role: data.role ?? null,
            seniority: data.seniority ?? null,
          },
          usage,
          costUsd,
        });
      }
      cases.push({ id: item.id, expected: item.expected, runs: itemRuns });
    }
    const report = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      contract: dataset.contract,
      datasetHash,
      identity: {
        specHash,
        model,
        bamlSourceHash: BAML_PRODUCTION_SOURCE_HASH,
        bamlVersion: BAML_RUNTIME_VERSION,
        taxonomyHash: taxonomy.taxonomyHash,
      },
      plan,
      limits: { maxCalls, maxCostUsd },
      spentUsd,
      metrics: summarizeEvaluation(cases),
      cases,
    };
    const out = resolve(value("--out") ?? `.scratch/vacancy-role-eval-${Date.now()}.json`);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(
      JSON.stringify(
        { mode: "live", out, calls: plan.requestedCalls, spentUsd, specHash },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

async function loadTaxonomy(pool: Pool): Promise<Taxonomy> {
  const rows = (
    await pool.query<{ type: "ROLE" | "DOMAIN" | "SKILL"; canonical_name: string }>(
      "SELECT type, canonical_name FROM nodes WHERE status='VERIFIED' ORDER BY type, canonical_name",
    )
  ).rows.map((row) => ({ type: row.type, name: row.canonical_name }));
  const roles = joinNamesByType(rows, "ROLE");
  const domains = joinNamesByType(rows, "DOMAIN");
  const skills = joinNamesByType(rows, "SKILL");
  return {
    roles,
    domains,
    skills,
    taxonomyHash: hashVerifiedTaxonomy([roles, domains, skills]),
  };
}

function readUsage(collector: Collector): Usage {
  const last = collector.last;
  return {
    in: collector.usage.inputTokens ?? 0,
    out: collector.usage.outputTokens ?? 0,
    cached: collector.usage.cachedInputTokens ?? 0,
    ms: last?.timing?.durationMs ?? null,
  };
}

function estimateCost(model: string, usage: Usage): number {
  const price = MODEL_PRICING_USD_PER_MTOK[model as keyof typeof MODEL_PRICING_USD_PER_MTOK];
  if (!price) throw new Error(`No pricing configured for ${model}; refusing live evaluation`);
  return (usage.in * price.in + usage.out * price.out + usage.cached * price.cachedIn) / 1_000_000;
}

function value(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function intValue(flag: string, fallback?: number): number {
  const raw = value(flag);
  if (raw === undefined && fallback !== undefined) return fallback;
  const number = Number(raw);
  if (!Number.isInteger(number)) throw new Error(`${flag} must be an integer`);
  return number;
}

function numberValue(flag: string): number {
  const number = Number(value(flag));
  if (!Number.isFinite(number)) throw new Error(`${flag} must be a number`);
  return number;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
