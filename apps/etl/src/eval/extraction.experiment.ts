/*
 * Offline Langfuse experiment for the raw vacancy extractor. It deliberately
 * does not boot Nest or use the cache: BamlVacancyExtractor is instantiated
 * directly with the same database-backed taxonomy source as production.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { LangfuseClient } from "@langfuse/client";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { cleanDescription } from "../02-enrich/dedup/sanitize";
import { BamlVacancyExtractor } from "../02-enrich/extraction/baml.extractor";
import type { ExtractionResult, VacancyExtractor } from "../02-enrich/extraction/vacancy-extractor";
import { normalizeAliasName } from "../platform/shared/normalize-alias";

import type {
  ExtractedVacancyForEval,
  RequirementDatasetCase,
  RequirementScore,
  ScorerAliasMap,
} from "./extraction-eval.types";
import { adaptLegacySkills, scoreRequirements, summarizeRequirements } from "./extraction.scorer";

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
type LegacyDraftCase = Omit<RequirementDatasetCase, "expectedOutput"> & {
  expectedOutput: Omit<RequirementDatasetCase["expectedOutput"], "isTech"> & {
    isTech: boolean | null;
  };
  note: string;
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
    const approvedScores = itemResults
      .map((result) => {
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
      })
      .filter(({ itemCase }) => itemCase.metadata.reviewStatus === "approved")
      .map(({ score }) => score);
    const summary = summarizeRequirements(approvedScores);
    assertReleaseGate(
      approvedScores,
      itemResults.map((result) => parseDatasetCase(result.item)),
    );
    return summaryToLangfuse(summary);
  };

  const result = await dataset.runExperiment({
    name: "vacancy-extraction-requirements-v2",
    runName: input.runName,
    description: "Raw BamlVacancyExtractor scored with the deterministic Requirements v2 scorer.",
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
  assertReleaseGate(
    approvedItems.map(({ score }) => score),
    scoredItems.map(({ itemCase }) => itemCase),
  );
  return {
    summary: summarizeRequirements(approvedItems.map(({ score }) => score)),
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
  const live = process.argv.includes("--live");
  if (process.argv.includes("--prepare-draft")) {
    await prepareDraftFromDatabase();
    return;
  }
  if (!live) {
    const legacyDataset = argumentValue("--legacy-dataset");
    const legacy = legacyDataset
      ? await inspectLegacyDataset(legacyDataset, argumentValue("--legacy-decisions"))
      : undefined;
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          dataset: argumentValue("--dataset") ?? "metahunt/vacancy-requirements-v2",
          draftPlan: {
            reusedReviewedVacancies: legacy?.rows ?? 15,
            explicitOrCases: 5,
            competencyAndMethodologyCases: 5,
            totalDraftCases: (legacy?.rows ?? 15) + 10,
          },
          draftCases: legacy
            ? [...legacy.legacyCases, ...targetedDraftCases]
            : "Pass --legacy-dataset to render the 15 reviewed singleton baselines plus 10 targeted cases.",
          note: "No database, LLM, Langfuse, or other external call was made. Supply --legacy-dataset to verify the 15 reviewed source rows before preparing the draft in Langfuse.",
        },
        null,
        2,
      ),
    );
    return;
  }
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
      extractor: new BamlVacancyExtractor(db),
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

async function prepareDraftFromDatabase(): Promise<void> {
  const legacyDataset = argumentValue("--legacy-dataset");
  if (!legacyDataset) throw new Error("--legacy-dataset is required for --prepare-draft");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for --prepare-draft");

  const legacy = await inspectLegacyDataset(legacyDataset, argumentValue("--legacy-decisions"));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const ids = legacy.legacyCases.map((item) => item.input.id);
    const { rows } = await pool.query<{ id: string; title: string; description: string }>(
      "SELECT id::text AS id, title, description FROM rss_records WHERE id = ANY($1::uuid[])",
      [ids],
    );
    const texts = new Map(
      rows.map((row) => [row.id, `Title: ${row.title}\n\n${cleanDescription(row.description)}`]),
    );
    if (texts.size !== legacy.legacyCases.length) {
      throw new Error(
        `database returned ${texts.size}/${legacy.legacyCases.length} reviewed vacancy texts`,
      );
    }
    const draftCases = [
      ...legacy.legacyCases.map((item) => ({
        input: { ...item.input, text: texts.get(item.input.id)! },
        expectedOutput: item.expectedOutput,
        metadata: item.metadata,
      })),
      ...targetedDraftCases,
    ];
    const out = resolve(argumentValue("--out") ?? ".scratch/vacancy-requirements-v2-draft.json");
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(draftCases, null, 2)}\n`, { mode: 0o600 });
    console.log(
      JSON.stringify(
        { mode: "prepare-draft", out, cases: draftCases.length, reviewStatus: "draft" },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

const targetedDraftCases: RequirementDatasetCase[] = [
  requirementCase(
    "or-pytorch-tensorflow",
    "ML Engineer",
    "PyTorch or TensorFlow is required.",
    ["or"],
    { priority: "must", anyOf: ["PyTorch", "TensorFlow"] },
  ),
  requirementCase(
    "or-prisma-typeorm",
    "Backend Engineer",
    "Prisma or TypeORM experience is required.",
    ["or"],
    { priority: "must", anyOf: ["Prisma", "TypeORM"] },
  ),
  requirementCase(
    "or-aws-gcp",
    "Platform Engineer",
    "Production AWS or GCP experience is required.",
    ["or"],
    { priority: "must", anyOf: ["AWS", "GCP"] },
  ),
  requirementCase(
    "or-test-framework",
    "QA Automation Engineer",
    "Selenium, Cypress, or Playwright experience is required.",
    ["or"],
    { priority: "must", anyOf: ["Selenium", "Cypress", "Playwright"] },
  ),
  requirementCase(
    "or-tdd-bdd",
    "Backend Engineer",
    "TDD or BDD practice is required.",
    ["or", "methodology"],
    { priority: "must", anyOf: ["TDD", "BDD"] },
  ),
  requirementCase(
    "competency-api-testing",
    "QA Engineer",
    "API Testing experience is required.",
    ["competency"],
    { priority: "must", value: "API Testing" },
  ),
  requirementCase(
    "competency-distributed-systems",
    "Backend Engineer",
    "Experience designing Distributed Systems is required.",
    ["competency"],
    { priority: "must", value: "Distributed Systems" },
  ),
  requirementCase(
    "competency-high-load",
    "Backend Engineer",
    "High-load Systems experience is required.",
    ["competency"],
    { priority: "must", value: "High-load Systems" },
  ),
  requirementCase(
    "competency-system-design",
    "Staff Engineer",
    "System Design expertise is required.",
    ["competency"],
    { priority: "must", value: "System Design" },
  ),
  requirementCase(
    "methodology-scrum",
    "Delivery Engineer",
    "Scrum experience is required.",
    ["methodology"],
    { priority: "must", value: "Scrum" },
  ),
];

function requirementCase(
  id: string,
  title: string,
  text: string,
  slices: string[],
  requirement: RequirementDatasetCase["expectedOutput"]["requirements"][number],
): RequirementDatasetCase {
  return {
    input: { id, title, text },
    expectedOutput: { isTech: true, role: null, seniority: null, requirements: [requirement] },
    metadata: { reviewStatus: "draft", slices, contractVersion: "requirements-v2" },
  };
}

async function inspectLegacyDataset(
  path: string,
  decisionsPath = resolve(dirname(path), "decisions.json"),
): Promise<{
  rows: number;
  legacyCases: LegacyDraftCase[];
}> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as {
    rows?: Array<{
      id?: unknown;
      title?: unknown;
      values?: {
        isTech?: unknown;
        role?: unknown;
        seniority?: unknown;
        skills?: { required?: unknown; optional?: unknown };
      };
    }>;
  };
  const decisions = JSON.parse(await readFile(decisionsPath, "utf8")) as {
    decisions?: Record<
      string,
      {
        approved?: unknown;
        overrides?: {
          isTech?: unknown;
          role?: unknown;
          seniority?: unknown;
          skills?: { required?: unknown; optional?: unknown };
        };
      }
    >;
  };
  if (!Array.isArray(parsed.rows) || parsed.rows.length < 15)
    throw new Error("legacy dataset must contain at least 15 reviewed rows");
  const legacyCases: LegacyDraftCase[] = parsed.rows.slice(0, 15).map((row) => {
    const decision = typeof row.id === "string" ? decisions.decisions?.[row.id] : undefined;
    if (decision?.approved !== true) {
      throw new Error(
        `legacy row ${typeof row.id === "string" ? row.id : "unknown"} is not approved`,
      );
    }
    const values = mergeLegacyValues(row.values, decision?.overrides);
    if (
      typeof row.id !== "string" ||
      typeof row.title !== "string" ||
      (values.isTech !== null && typeof values.isTech !== "boolean") ||
      (values.role !== null && typeof values.role !== "string") ||
      (values.seniority !== null && typeof values.seniority !== "string")
    ) {
      throw new Error(
        "legacy dataset rows must include reviewed id, title, isTech, role, and seniority values",
      );
    }
    const skills = values.skills;
    if (
      (skills?.required !== undefined && !isStringArray(skills.required)) ||
      (skills?.optional !== undefined && !isStringArray(skills.optional))
    ) {
      throw new Error("legacy dataset skills must contain only string arrays");
    }
    const required = skills?.required;
    const optional = skills?.optional;
    const legacySkills = {
      required: isStringArray(required) ? required : undefined,
      optional: isStringArray(optional) ? optional : undefined,
    };
    return {
      input: { id: row.id, title: row.title, text: "<load reviewed source text before upload>" },
      expectedOutput: {
        isTech: values.isTech,
        role: values.role,
        seniority: values.seniority,
        requirements: adaptLegacySkills(legacySkills),
      },
      metadata: {
        reviewStatus: "draft",
        slices: ["legacy-reviewed"],
        contractVersion: "requirements-v2",
      },
      note: "Replace placeholder text from the reviewed source before upload; preserve a null guard only until its human review resolves it.",
    };
  });
  return { rows: legacyCases.length, legacyCases };
}

function mergeLegacyValues(
  values:
    | {
        isTech?: unknown;
        role?: unknown;
        seniority?: unknown;
        skills?: { required?: unknown; optional?: unknown };
      }
    | undefined,
  overrides:
    | {
        isTech?: unknown;
        role?: unknown;
        seniority?: unknown;
        skills?: { required?: unknown; optional?: unknown };
      }
    | undefined,
): {
  isTech: unknown;
  role: unknown;
  seniority: unknown;
  skills: { required?: unknown; optional?: unknown } | undefined;
} {
  const select = (key: "isTech" | "role" | "seniority" | "skills") =>
    overrides && Object.prototype.hasOwnProperty.call(overrides, key)
      ? overrides[key]
      : values?.[key];
  return {
    isTech: select("isTech"),
    role: select("role"),
    seniority: select("seniority"),
    skills: select("skills") as { required?: unknown; optional?: unknown } | undefined,
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
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
