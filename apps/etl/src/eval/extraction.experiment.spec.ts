import { assertReleaseGate, parseDatasetCase } from "./extraction.experiment";
import { scoreRequirements } from "./extraction.scorer";
import type { RequirementDatasetCase } from "./extraction-eval.types";
import draftDataset from "./vacancy-requirements-v2.dataset.json";

const approvedOrCase: RequirementDatasetCase = {
  input: { id: "or-1", title: "Platform engineer", text: "AWS or GCP is required." },
  expectedOutput: {
    isTech: true,
    role: "DevOps Engineer",
    seniority: "SENIOR",
    requirements: [{ priority: "must", anyOf: ["AWS", "GCP"] }],
  },
  metadata: { reviewStatus: "approved", slices: ["or"], contractVersion: "requirements-v2" },
};

describe("Requirements v2 Langfuse experiment", () => {
  it("ships 25 real-text draft cases, including explicit OR boundaries", () => {
    expect(draftDataset).toHaveLength(25);
    expect(new Set(draftDataset.map((item) => item.input.id)).size).toBe(25);
    expect(draftDataset.every((item) => item.metadata.reviewStatus === "draft")).toBe(true);
    expect(draftDataset.some((item) => item.metadata.slices.includes("or"))).toBe(true);
    expect(draftDataset.every((item) => item.input.text.length > 100)).toBe(true);
    expect(draftDataset.every((item) => item.expectedOutput.requirements.length > 0)).toBe(true);
    expect(() => draftDataset.forEach((item) => parseDatasetCase(item))).not.toThrow();
  });

  it("rejects hosted rows that do not contain the focused contract", () => {
    expect(() =>
      parseDatasetCase({ input: { id: "x" }, expectedOutput: {}, metadata: {} }),
    ).toThrow("Requirements v2 input");
  });

  it("requires an approved explicit OR boundary for the release gate", () => {
    const score = scoreRequirements(approvedOrCase.expectedOutput, {
      isTech: true,
      role: "DevOps Engineer",
      seniority: "SENIOR",
      requirements: [{ priority: "must", anyOf: ["GCP", "AWS"] }],
    });
    expect(() =>
      assertReleaseGate(
        [score],
        [{ ...approvedOrCase, metadata: { ...approvedOrCase.metadata, slices: [] } }],
      ),
    ).toThrow("no approved explicit OR boundary case");
    expect(() => assertReleaseGate([score], [approvedOrCase])).not.toThrow();
  });

  it("fails the release gate for a provider or OR split failure", () => {
    const providerFailure = scoreRequirements(
      approvedOrCase.expectedOutput,
      null,
      new Map(),
      "provider down",
    );
    expect(() => assertReleaseGate([providerFailure], [approvedOrCase])).toThrow(
      "provider failures",
    );

    const split = scoreRequirements(approvedOrCase.expectedOutput, {
      isTech: true,
      role: "DevOps Engineer",
      seniority: "SENIOR",
      requirements: [
        { priority: "must", value: "AWS" },
        { priority: "must", value: "GCP" },
      ],
    });
    expect(() => assertReleaseGate([split], [approvedOrCase])).toThrow(
      "explicit OR requirement was split",
    );
  });
});
