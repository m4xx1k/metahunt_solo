import type { GoldenSet } from "./golden-set.schema";

export type ExpectedExtraction = {
  isTech: boolean;
  role: string | null;
  seniority: string | null;
};

export type ActualExtraction = ExpectedExtraction;

export type ScoredCase = {
  expected: ExpectedExtraction;
  runs: Array<{ actual: ActualExtraction }>;
};

export type EvaluationPlan = {
  approvedCases: number;
  draftCases: number;
  rejectedCases: number;
  requestedRuns: number;
  requestedCalls: number;
};

export function buildEvaluationPlan(dataset: GoldenSet, runs: number): EvaluationPlan {
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) {
    throw new Error("--runs must be an integer from 1 to 10");
  }
  const approvedCases = dataset.cases.filter((item) => item.reviewStatus === "approved").length;
  const draftCases = dataset.cases.filter((item) => item.reviewStatus === "draft").length;
  const rejectedCases = dataset.cases.filter((item) => item.reviewStatus === "rejected").length;
  return {
    approvedCases,
    draftCases,
    rejectedCases,
    requestedRuns: runs,
    requestedCalls: approvedCases * runs,
  };
}

export function assertLiveLimits(plan: EvaluationPlan, maxCalls: number, maxCostUsd: number): void {
  if (plan.draftCases > 0) {
    throw new Error(
      `refusing live evaluation: ${plan.draftCases} dataset case(s) still need human review`,
    );
  }
  if (plan.approvedCases === 0) {
    throw new Error("refusing live evaluation: dataset has no human-approved cases");
  }
  if (!Number.isInteger(maxCalls) || maxCalls < 1) {
    throw new Error("--max-calls must be a positive integer for --live");
  }
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) {
    throw new Error("--max-cost-usd must be a positive number for --live");
  }
  if (plan.requestedCalls > maxCalls) {
    throw new Error(
      `refusing live evaluation: ${plan.requestedCalls} requested calls exceeds --max-calls=${maxCalls}`,
    );
  }
}

export function assertExpectedRolesAreVerified(dataset: GoldenSet, verifiedRoles: string[]): void {
  const allowed = new Set(verifiedRoles);
  const missing = [
    ...new Set(
      dataset.cases
        .filter((item) => item.reviewStatus === "approved")
        .map((item) => item.expected.role)
        .filter((role): role is string => role !== null)
        .filter((role) => !allowed.has(role)),
    ),
  ];
  if (missing.length > 0) {
    throw new Error(
      `refusing live evaluation: approved expected role(s) are not VERIFIED: ${missing.join(", ")}`,
    );
  }
}

export function summarizeEvaluation(cases: ScoredCase[]) {
  const runs = cases.flatMap((item) =>
    item.runs.map((run) => ({ expected: item.expected, ...run })),
  );
  const fraction = (matches: number, total: number) => (total === 0 ? null : matches / total);
  const equal = (left: ActualExtraction, right: ExpectedExtraction) =>
    left.isTech === right.isTech && left.role === right.role && left.seniority === right.seniority;
  return {
    evaluatedCases: cases.length,
    evaluatedRuns: runs.length,
    accuracy: {
      isTech: fraction(
        runs.filter((run) => run.actual.isTech === run.expected.isTech).length,
        runs.length,
      ),
      role: fraction(
        runs.filter((run) => run.actual.role === run.expected.role).length,
        runs.length,
      ),
      seniority: fraction(
        runs.filter((run) => run.actual.seniority === run.expected.seniority).length,
        runs.length,
      ),
      exact: fraction(runs.filter((run) => equal(run.actual, run.expected)).length, runs.length),
    },
    stability: fraction(
      cases.filter((item) => {
        const signatures = new Set(
          item.runs.map((run) =>
            JSON.stringify([run.actual.isTech, run.actual.role, run.actual.seniority]),
          ),
        );
        return signatures.size <= 1;
      }).length,
      cases.length,
    ),
  };
}
