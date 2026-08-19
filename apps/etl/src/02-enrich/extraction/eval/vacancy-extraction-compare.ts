import { z } from "zod";

import {
  summarizeEvaluation,
  type ActualExtraction,
  type ExpectedExtraction,
} from "./vacancy-extraction-eval";

const extractionSchema = z.object({
  isTech: z.boolean(),
  role: z.string().nullable(),
  seniority: z.string().nullable(),
});

const reportCaseSchema = z.object({
  id: z.string(),
  expected: extractionSchema,
  runs: z.array(z.object({ actual: extractionSchema })).min(1),
});

export const evaluationReportSchema = z.object({
  schemaVersion: z.literal(1),
  contract: z.literal("role-contract-v1"),
  datasetHash: z.string().regex(/^[a-f0-9]{64}$/),
  identity: z.object({
    specHash: z.string().regex(/^[a-f0-9]{64}$/),
    model: z.string().min(1),
    bamlSourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    bamlVersion: z.string().min(1),
    taxonomyHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  metrics: z.object({
    accuracy: z.object({
      isTech: z.number().nullable(),
      role: z.number().nullable(),
      seniority: z.number().nullable(),
      exact: z.number().nullable(),
    }),
    stability: z.number().nullable(),
  }),
  cases: z.array(reportCaseSchema).min(1),
});

export type EvaluationReport = z.infer<typeof evaluationReportSchema>;

type Metric = "isTech" | "role" | "seniority" | "exact" | "stability";
type CaseScore = Record<Metric, number | null>;

export function compareEvaluationReports(baseline: EvaluationReport, candidate: EvaluationReport) {
  if (baseline.contract !== candidate.contract) {
    throw new Error("cannot compare reports with different role contracts");
  }
  if (baseline.datasetHash !== candidate.datasetHash) {
    throw new Error("cannot compare reports from different golden-set datasets");
  }
  if (baseline.identity.model !== candidate.identity.model) {
    throw new Error("cannot compare reports from different models");
  }
  if (baseline.identity.taxonomyHash !== candidate.identity.taxonomyHash) {
    throw new Error("cannot compare reports from different VERIFIED taxonomy snapshots");
  }

  const baselineCases = new Map(baseline.cases.map((item) => [item.id, item]));
  const candidateCases = new Map(candidate.cases.map((item) => [item.id, item]));
  const allIds = [...new Set([...baselineCases.keys(), ...candidateCases.keys()])].sort();
  if (
    baselineCases.size !== candidateCases.size ||
    allIds.some((id) => !baselineCases.has(id) || !candidateCases.has(id))
  ) {
    throw new Error("cannot compare reports with different evaluated case IDs");
  }

  const cases = allIds.map((id) => {
    const baselineCase = baselineCases.get(id)!;
    const candidateCase = candidateCases.get(id)!;
    if (JSON.stringify(baselineCase.expected) !== JSON.stringify(candidateCase.expected)) {
      throw new Error(`cannot compare reports with different expected labels for ${id}`);
    }
    if (baselineCase.runs.length !== candidateCase.runs.length) {
      throw new Error(`cannot compare reports with different run counts for ${id}`);
    }
    const baselineScore = scoreCase(baselineCase.expected, baselineCase.runs);
    const candidateScore = scoreCase(candidateCase.expected, candidateCase.runs);
    return {
      id,
      expected: baselineCase.expected,
      baseline: baselineScore,
      candidate: candidateScore,
      delta: deltas(baselineScore, candidateScore),
    };
  });

  return {
    schemaVersion: 1,
    contract: baseline.contract,
    datasetHash: baseline.datasetHash,
    baseline: baseline.identity,
    candidate: candidate.identity,
    metrics: {
      baseline: flattenMetrics(baseline),
      candidate: flattenMetrics(candidate),
      delta: deltas(flattenMetrics(baseline), flattenMetrics(candidate)),
    },
    cases,
  };
}

function scoreCase(
  expected: ExpectedExtraction,
  runs: Array<{ actual: ActualExtraction }>,
): CaseScore {
  const summary = summarizeEvaluation([{ expected, runs }]);
  return {
    ...summary.accuracy,
    stability: summary.stability,
  };
}

function flattenMetrics(report: EvaluationReport): CaseScore {
  return { ...report.metrics.accuracy, stability: report.metrics.stability };
}

function deltas(baseline: CaseScore, candidate: CaseScore): CaseScore {
  return Object.fromEntries(
    (Object.keys(baseline) as Metric[]).map((key) => [
      key,
      baseline[key] === null || candidate[key] === null ? null : candidate[key] - baseline[key],
    ]),
  ) as CaseScore;
}
