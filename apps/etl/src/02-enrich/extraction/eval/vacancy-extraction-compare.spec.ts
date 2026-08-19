import { compareEvaluationReports, type EvaluationReport } from "./vacancy-extraction-compare";

const hash = (character: string) => character.repeat(64);

function report(role: string, datasetHash = hash("a")): EvaluationReport {
  return {
    schemaVersion: 1,
    contract: "role-contract-v1",
    datasetHash,
    identity: {
      specHash: hash(role === "Backend Engineer" ? "b" : "c"),
      model: "deepseek-v4-flash",
      bamlSourceHash: hash("d"),
      bamlVersion: "0.222.0",
      taxonomyHash: hash("e"),
    },
    metrics: {
      accuracy: {
        isTech: 1,
        role: role === "Backend Engineer" ? 1 : 0,
        seniority: 1,
        exact: role === "Backend Engineer" ? 1 : 0,
      },
      stability: 1,
    },
    cases: [
      {
        id: "backend",
        expected: { isTech: true, role: "Backend Engineer", seniority: null },
        runs: [{ actual: { isTech: true, role, seniority: null } }],
      },
    ],
  };
}

describe("vacancy extraction evaluation comparison", () => {
  it("compares matching reports and exposes aggregate and per-case deltas", () => {
    const comparison = compareEvaluationReports(
      report("Backend Engineer"),
      report("Software Engineer"),
    );

    expect(comparison.metrics.delta).toEqual({
      isTech: 0,
      role: -1,
      seniority: 0,
      exact: -1,
      stability: 0,
    });
    expect(comparison.cases[0]).toMatchObject({
      id: "backend",
      delta: { isTech: 0, role: -1, seniority: 0, exact: -1, stability: 0 },
    });
  });

  it("refuses a comparison across different golden-set versions", () => {
    expect(() =>
      compareEvaluationReports(report("Backend Engineer"), report("Software Engineer", hash("f"))),
    ).toThrow("different golden-set datasets");
  });

  it("refuses a comparison when the model or taxonomy changed", () => {
    const baseline = report("Backend Engineer");
    const differentModel = report("Software Engineer");
    differentModel.identity.model = "another-model";
    expect(() => compareEvaluationReports(baseline, differentModel)).toThrow("different models");

    const differentTaxonomy = report("Software Engineer");
    differentTaxonomy.identity.taxonomyHash = hash("f");
    expect(() => compareEvaluationReports(baseline, differentTaxonomy)).toThrow(
      "different VERIFIED taxonomy snapshots",
    );
  });
});
