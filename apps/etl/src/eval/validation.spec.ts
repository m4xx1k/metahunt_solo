import type { CandidatesFile, DatasetFile, DecisionsFile, Extraction, LabelFile } from "./types";
import { validateGolden } from "./validation";

const values: Extraction = {
  isTech: true,
  role: "Backend Developer",
  seniority: null,
  skills: { required: ["TypeScript"], optional: [] },
  experienceYears: null,
  salary: null,
  englishLevel: null,
  employmentType: null,
  workFormat: null,
  locations: [],
  domain: null,
  engagementType: null,
  companyName: null,
  hasTestAssignment: null,
  hasReservation: null,
};

function input(overrides: Partial<{ values: Extraction; arbiter: Extraction["skills"] }> = {}) {
  const expected = overrides.values ?? values;
  const dataset: DatasetFile = {
    generatedAt: "2026-07-28T00:00:00.000Z",
    rows: [
      {
        id: "one",
        title: "Backend",
        link: null,
        source: "dou",
        values: expected,
        approvedAt: "now",
      },
    ],
  };
  const decisions: DecisionsFile = {
    generatedAt: "2026-07-28T00:00:00.000Z",
    decisions: { one: { approved: true, overrides: {}, values: expected, reviewedAt: "now" } },
  };
  const candidates: CandidatesFile = {
    generatedAt: "2026-07-28T00:00:00.000Z",
    candidates: [
      {
        id: "one",
        title: "Backend",
        link: null,
        source: "dou",
        fields: {
          skills: { value: expected.skills, verdict: "contested", a: null, b: null, prod: null },
        },
      },
    ],
  };
  const arbiter: LabelFile = {
    batch: 0,
    labeller: "arbiter",
    labels: [{ id: "one", values: { skills: overrides.arbiter ?? expected.skills } }],
  };
  return { dataset, decisions, candidates, arbiter };
}

describe("validateGolden", () => {
  it("accepts a complete decision-backed dataset with merged arbiter values", () => {
    const valid = input();
    valid.candidates.candidates[0].fields.skills.arbiter = values.skills;
    expect(validateGolden(valid)).toEqual([]);
  });

  it("rejects skills that exceed the extractor cap", () => {
    const invalid = input({
      values: { ...values, skills: { required: [], optional: ["a", "b", "c", "d", "e", "f"] } },
    });
    expect(validateGolden(invalid)).toContain("one: skills.optional exceeds 5");
  });

  it("rejects an arbiter file that was not merged into candidates", () => {
    expect(validateGolden(input())).toContain("one: candidate arbiter value for skills is stale");
  });

  it("rejects dataset values that drift from the approved decision snapshot", () => {
    const invalid = input();
    invalid.dataset.rows[0].values = { ...values, role: "Frontend Developer" };
    expect(validateGolden(invalid)).toContain(
      "one: dataset values differ from approved decision snapshot",
    );
  });
});
