import type { GoldenSet } from "./golden-set.schema";
import {
  assertExpectedRolesAreVerified,
  assertLiveLimits,
  buildEvaluationPlan,
  summarizeEvaluation,
} from "./vacancy-extraction-eval";

const dataset = (reviewStatus: "draft" | "approved" = "approved") =>
  ({
    schemaVersion: 1,
    contract: "role-contract-v1",
    taxonomySource: "live-verified-at-eval-time",
    cases: [
      {
        id: "case-1",
        slice: "role",
        source: "synthetic_contract_fixture",
        text: "Backend Engineer",
        expected: { isTech: true, role: "Backend Engineer", seniority: null },
        rationale: "test",
        reviewStatus,
      },
    ],
  }) as GoldenSet;

describe("vacancy extraction evaluation limits", () => {
  it("counts only approved cases toward paid calls", () => {
    expect(buildEvaluationPlan(dataset(), 3)).toEqual({
      approvedCases: 1,
      draftCases: 0,
      rejectedCases: 0,
      requestedRuns: 3,
      requestedCalls: 3,
    });
  });

  it("refuses a live run without reviewed cases or hard limits", () => {
    const draftPlan = buildEvaluationPlan(dataset("draft"), 3);
    expect(() => assertLiveLimits(draftPlan, 3, 1)).toThrow("still need human review");
    expect(() => assertLiveLimits(buildEvaluationPlan(dataset(), 3), 2, 1)).toThrow(
      "exceeds --max-calls=2",
    );
    expect(() => assertLiveLimits(buildEvaluationPlan(dataset(), 3), 3, 0)).toThrow(
      "--max-cost-usd",
    );
  });

  it("requires an approved expected role to exist in the frozen VERIFIED taxonomy", () => {
    expect(() => assertExpectedRolesAreVerified(dataset(), ["Backend Engineer"])).not.toThrow();
    expect(() => assertExpectedRolesAreVerified(dataset(), ["Frontend Engineer"])).toThrow(
      "not VERIFIED: Backend Engineer",
    );
  });

  it("reports exact field accuracy and per-case stability separately", () => {
    expect(
      summarizeEvaluation([
        {
          expected: { isTech: true, role: "Backend Engineer", seniority: "SENIOR" },
          runs: [
            { actual: { isTech: true, role: "Backend Engineer", seniority: "SENIOR" } },
            { actual: { isTech: true, role: "Backend Engineer", seniority: "SENIOR" } },
          ],
        },
        {
          expected: { isTech: true, role: "Data Engineer", seniority: null },
          runs: [
            { actual: { isTech: true, role: "Data Engineer", seniority: null } },
            { actual: { isTech: true, role: "Software Engineer", seniority: null } },
          ],
        },
      ]),
    ).toEqual({
      evaluatedCases: 2,
      evaluatedRuns: 4,
      accuracy: { isTech: 1, role: 0.75, seniority: 1, exact: 0.75 },
      stability: 0.5,
    });
  });
});
