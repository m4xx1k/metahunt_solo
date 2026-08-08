import type {
  CandidatesFile,
  DatasetFile,
  DecisionsFile,
  EvaluationSnapshot,
  Extraction,
  LabelFile,
  RunProvenance,
} from "./types";
import { sha256 } from "./snapshot";
import { validateGolden, validateRelease, validateRunProvenance } from "./validation";

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

  it("requires a rationale when a human supersedes the merged candidate", () => {
    const valid = input();
    valid.candidates.candidates[0].fields.skills.arbiter = values.skills;
    valid.candidates.candidates[0].fields.skills.value = { required: [], optional: [] };
    valid.decisions.decisions.one.overrides.skills = values.skills;
    expect(validateRelease(valid)).toContain("one: skills override needs review rationale");

    valid.decisions.decisions.one.rationales = {
      skills: { disposition: "manual-ruling", evidence: "Requirements section names TypeScript." },
    };
    expect(validateRelease(valid)).toEqual([]);
  });

  it("requires an allowed exclusion reason and source evidence", () => {
    const valid = input();
    valid.candidates.candidates[0].fields.skills.arbiter = values.skills;
    valid.decisions.decisions.one.exclusions = {
      salary: {
        reason: "schema-limitation",
        evidence: "Posting states annual gross compensation.",
      },
    };
    valid.dataset.rows[0].exclusions = valid.decisions.decisions.one.exclusions;
    expect(validateGolden(valid)).toEqual([]);

    const salaryExclusion = valid.decisions.decisions.one.exclusions?.salary;
    if (!salaryExclusion) throw new Error("test fixture must contain a salary exclusion");
    salaryExclusion.evidence = "";
    expect(validateGolden(valid)).toContain("one: salary exclusion needs source evidence");
  });

  it("binds a scored run to the immutable evaluation snapshot", () => {
    const snapshot: EvaluationSnapshot = {
      generatedAt: "now",
      corpusSha256: "corpus",
      prompt: { version: 3, sourceSha256: "prompt" },
      taxonomy: { roles: "roles", domains: "domains", skills: "skills" },
      aliases: { "SKILL:ts": "TypeScript" },
    };
    const provenance: RunProvenance = {
      run: "candidate-v4",
      createdAt: "2026-08-08T00:00:00.000Z",
      runner: "baml",
      provider: "openai",
      model: "gpt-5.4-mini",
      pipelineCommit: "abc123",
      snapshot: {
        corpusSha256: snapshot.corpusSha256,
        promptVersion: snapshot.prompt.version,
        promptSourceSha256: snapshot.prompt.sourceSha256,
        taxonomySha256: sha256(JSON.stringify(snapshot.taxonomy)),
        aliasesSha256: sha256(JSON.stringify(snapshot.aliases)),
      },
    };
    expect(validateRunProvenance("candidate-v4", provenance, snapshot)).toEqual([]);
    provenance.snapshot.promptSourceSha256 = "different";
    expect(validateRunProvenance("candidate-v4", provenance, snapshot)).toContain(
      "run provenance promptSourceSha256 does not match evaluation snapshot",
    );
  });
});
