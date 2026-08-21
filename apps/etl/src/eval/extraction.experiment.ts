/*
 * Offline Langfuse experiment for the eval-only Requirements v2 extractor.
 * It deliberately does not boot Nest or use the cache; production's
 * ExtractVacancy contract remains untouched.
 */
import { LangfuseClient } from "@langfuse/client";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { ExtractionResult, VacancyExtractor } from "../02-enrich/extraction/vacancy-extractor";
import { normalizeAliasName } from "../platform/shared/normalize-alias";

import type {
  ExtractedVacancyForEval,
  RequirementDatasetCase,
  RequirementScore,
  ScorerAliasMap,
} from "./extraction-eval.types";
import { scoreRequirements, summarizeRequirements } from "./extraction.scorer";
import { BamlRequirementsV2Extractor } from "./requirements-v2.baml.extractor";

type ExperimentOutput = {
  actual: ExtractedVacancyForEval | null;
  providerError?: string;
  latencyMs: number | null;
  usage: ExtractionResult["meta"]["usage"];
};
type DatasetItem = { input?: unknown; expectedOutput?: unknown; metadata?: unknown };
type HostedDataset = {
  items: DatasetItem[];
  version?: string;
  runExperiment: (params: Record<string, unknown>) => Promise<{
    format: () => Promise<string>;
    datasetRunUrl?: string;
    itemResults: Array<{ item: DatasetItem; output: ExperimentOutput }>;
  }>;
};
type LangfuseGateway = {
  dataset: { get: (name: string, options?: { version?: string }) => Promise<HostedDataset> };
};
export async function runHostedExperiment(input: {
  langfuse: LangfuseGateway;
  extractor: VacancyExtractor;
  aliases: ScorerAliasMap;
  datasetName: string;
  datasetVersion?: string;
  runName?: string;
}): Promise<{
  summary: ReturnType<typeof summarizeRequirements>;
  formatted: string;
  datasetVersion?: string;
  datasetRunUrl?: string;
}> {
  const dataset = await input.langfuse.dataset.get(input.datasetName, {
    version: input.datasetVersion,
  });
  const cases = dataset.items.map(parseDatasetCase);
  const identity = await input.extractor.identity(cases[0]?.input.text ?? "");
  const metadata = {
    contractVersion: "requirements-v2",
    datasetVersion: dataset.version ?? input.datasetVersion ?? "latest",
    taxonomyHash: identity.taxonomyHash,
    taxonomyIdentity: identity.taxonomyHash,
    extractionSpecHash: identity.specHash,
    bamlSourceHash: identity.bamlSourceHash,
    bamlVersion: identity.bamlVersion,
    provider: identity.provider,
    model: identity.model,
  };
  const task = async (item: DatasetItem): Promise<ExperimentOutput> => {
    const itemCase = parseDatasetCase(item);
    const startedAt = Date.now();
    try {
      const result = await input.extractor.extract(itemCase.input.text);
      return {
        actual: (result.data as ExtractedVacancyForEval | null) ?? null,
        providerError: result.meta.error,
        latencyMs: result.meta.usage.ms ?? Date.now() - startedAt,
        usage: result.meta.usage,
      };
    } catch (error) {
      return {
        actual: null,
        providerError: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt,
        usage: {
          in: 0,
          out: 0,
          cached: 0,
          client: "unknown",
          provider: "unknown",
          model: "unknown",
          ms: null,
        },
      };
    }
  };
  const evaluator = async ({
    input: rawInput,
    expectedOutput,
    output,
  }: {
    input: unknown;
    expectedOutput?: unknown;
    output: ExperimentOutput;
  }) => {
    const itemCase = parseDatasetCase({
      input: rawInput,
      expectedOutput,
      metadata: findMetadata(cases, rawInput),
    });
    return scoresToLangfuse(
      scoreRequirements(
        itemCase.expectedOutput,
        output.actual,
        input.aliases,
        output.providerError,
      ),
    );
  };
  const runEvaluator = async ({
    itemResults,
  }: {
    itemResults: Array<{ item: DatasetItem; output: ExperimentOutput }>;
  }) => {
    const scoredItems = itemResults.map((result) => {
      const itemCase = parseDatasetCase(result.item);
      return {
        itemCase,
        score: scoreRequirements(
          itemCase.expectedOutput,
          result.output.actual,
          input.aliases,
          result.output.providerError,
        ),
      };
    });
    const approvedItems = scoredItems.filter(
      ({ itemCase }) => itemCase.metadata.reviewStatus === "approved",
    );
    // Draft-only runs are for inspection: show their aggregate, but never claim a release gate.
    // Once there is an approved subset, summaries and gates use only that reviewed subset.
    const summaryItems = approvedItems.length > 0 ? approvedItems : scoredItems;
    if (approvedItems.length > 0) {
      assertReleaseGate(
        approvedItems.map(({ score }) => score),
        scoredItems.map(({ itemCase }) => itemCase),
      );
    }
    const summary = summarizeRequirements(summaryItems.map(({ score }) => score));
    return summaryToLangfuse(summary);
  };

  const result = await dataset.runExperiment({
    name: "vacancy-extraction-requirements-v2",
    runName: input.runName,
    description: "Eval-only BAML Requirements v2 extractor scored with the deterministic scorer.",
    metadata,
    task,
    evaluators: [evaluator],
    runEvaluators: [runEvaluator],
    maxConcurrency: 1,
  });
  const scoredItems = result.itemResults.map((itemResult) => {
    const itemCase = parseDatasetCase(itemResult.item);
    return {
      itemCase,
      score: scoreRequirements(
        itemCase.expectedOutput,
        itemResult.output.actual,
        input.aliases,
        itemResult.output.providerError,
      ),
    };
  });
  const approvedItems = scoredItems.filter(
    ({ itemCase }) => itemCase.metadata.reviewStatus === "approved",
  );
  if (approvedItems.length > 0) {
    assertReleaseGate(
      approvedItems.map(({ score }) => score),
      scoredItems.map(({ itemCase }) => itemCase),
    );
  }
  const summaryItems = approvedItems.length > 0 ? approvedItems : scoredItems;
  return {
    summary: summarizeRequirements(summaryItems.map(({ score }) => score)),
    formatted: await result.format(),
    datasetVersion: dataset.version,
    datasetRunUrl: result.datasetRunUrl,
  };
}

export function parseDatasetCase(item: DatasetItem): RequirementDatasetCase {
  const input = item.input as RequirementDatasetCase["input"];
  const expectedOutput = item.expectedOutput as RequirementDatasetCase["expectedOutput"];
  const metadata = item.metadata as RequirementDatasetCase["metadata"];
  if (
    !input ||
    typeof input.id !== "string" ||
    typeof input.title !== "string" ||
    typeof input.text !== "string" ||
    !expectedOutput ||
    !Array.isArray(expectedOutput.requirements) ||
    !metadata ||
    !["draft", "approved", "rejected"].includes(metadata.reviewStatus) ||
    !Array.isArray(metadata.slices)
  ) {
    throw new Error(
      "Langfuse item must use the Requirements v2 input, expectedOutput, and metadata shape",
    );
  }
  return { input, expectedOutput, metadata };
}

/** Release gates apply only to human-approved dataset rows. */
export function assertReleaseGate(
  scores: RequirementScore[],
  items: RequirementDatasetCase[],
): void {
  if (scores.length === 0) throw new Error("release gate: no approved dataset items");
  const summary = summarizeRequirements(scores);
  if (summary.providerFailureRate !== 0)
    throw new Error("release gate: provider failures must be resolved separately");
  if (summary.schemaValidRate !== 1) throw new Error("release gate: schema validity must be 100%");
  if (summary.orSplitErrors !== 0)
    throw new Error("release gate: explicit OR requirement was split into singleton requirements");
  const approvedOrCases = items.filter(
    (item) => item.metadata.reviewStatus === "approved" && item.metadata.slices.includes("or"),
  );
  if (approvedOrCases.length === 0)
    throw new Error("release gate: no approved explicit OR boundary case");
}

function scoresToLangfuse(score: RequirementScore) {
  return [
    ["schema_valid", Number(score.schemaValid)],
    ["provider_failure", Number(score.providerFailure)],
    ["requirements_precision", score.requirementsPrecision],
    ["requirements_recall", score.requirementsRecall],
    ["requirements_f1", score.requirementsF1],
    ["priority_accuracy", score.priorityAccuracy],
    ["alternative_accuracy", score.alternativeAccuracy],
    ["or_split_errors", score.orSplitErrors],
    ["is_tech_accuracy", score.guardAccuracy.isTech],
    ["role_accuracy", score.guardAccuracy.role],
    ["seniority_accuracy", score.guardAccuracy.seniority],
  ].map(([name, value]) => ({ name, value, comment: score.error }));
}

function summaryToLangfuse(summary: ReturnType<typeof summarizeRequirements>) {
  return [
    ["schema_valid_rate", summary.schemaValidRate],
    ["provider_failure_rate", summary.providerFailureRate],
    ["requirements_precision", summary.requirementsPrecision],
    ["requirements_recall", summary.requirementsRecall],
    ["requirements_f1", summary.requirementsF1],
    ["priority_accuracy", summary.priorityAccuracy],
    ["alternative_accuracy", summary.alternativeAccuracy],
    ["or_split_errors", summary.orSplitErrors],
    ["is_tech_accuracy", summary.guardAccuracy.isTech],
    ["role_accuracy", summary.guardAccuracy.role],
    ["seniority_accuracy", summary.guardAccuracy.seniority],
  ].map(([name, value]) => ({ name, value }));
}

function findMetadata(cases: RequirementDatasetCase[], rawInput: unknown) {
  return cases.find(
    (item) => item.input === rawInput || item.input.id === (rawInput as { id?: string })?.id,
  )?.metadata;
}

async function loadAliases(db: DrizzleDB): Promise<ScorerAliasMap> {
  const rows = await db
    .select({ alias: schema.nodeAliases.name, canonical: schema.nodes.canonicalName })
    .from(schema.nodeAliases)
    .innerJoin(schema.nodes, eq(schema.nodeAliases.nodeId, schema.nodes.id))
    .where(and(eq(schema.nodeAliases.type, "SKILL"), eq(schema.nodes.type, "SKILL")));
  const canonical = await db
    .select({ name: schema.nodes.canonicalName })
    .from(schema.nodes)
    .where(and(eq(schema.nodes.type, "SKILL"), eq(schema.nodes.status, "VERIFIED")));
  return new Map([
    ...rows.map((row) => [row.alias, row.canonical] as const),
    ...canonical.map((row) => [normalizeAliasName(row.name), row.name] as const),
  ]);
}

async function main(): Promise<void> {
  const datasetName = argumentValue("--dataset");
  if (!datasetName) throw new Error("--dataset is required for --live");
  for (const name of [
    "LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SECRET_KEY",
    "DATABASE_URL",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_MODEL",
  ]) {
    if (!process.env[name]) throw new Error(`${name} is required for --live`);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const otelSdk = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor({ exportMode: "immediate" })],
  });
  otelSdk.start();
  try {
    const db = drizzle(pool, { schema });
    const result = await runHostedExperiment({
      langfuse: new LangfuseClient() as unknown as LangfuseGateway,
      extractor: new BamlRequirementsV2Extractor(),
      aliases: await loadAliases(db),
      datasetName,
      datasetVersion: argumentValue("--dataset-version"),
      runName: argumentValue("--run-name"),
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await otelSdk.shutdown();
    await pool.end();
  }
}

function argumentValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
