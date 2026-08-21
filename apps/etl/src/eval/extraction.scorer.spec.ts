import {
  adaptLegacySkills,
  canonicalizeRequirement,
  scoreRequirements,
  summarizeRequirements,
} from "./extraction.scorer";
import type { ExtractedVacancyForEval, RequirementDatasetCase } from "./extraction-eval.types";

const aliases = new Map([
  ["nodejs", "skill-node"],
  ["react", "skill-react"],
  ["vuejs", "skill-vue"],
  ["typescript", "skill-typescript"],
]);

const expected = (
  requirements: RequirementDatasetCase["expectedOutput"]["requirements"],
): RequirementDatasetCase["expectedOutput"] => ({
  isTech: true,
  role: "Backend Engineer",
  seniority: "SENIOR",
  requirements,
});

const actual = (requirements: RequirementDatasetCase["expectedOutput"]["requirements"]) => ({
  isTech: true,
  role: "Backend Engineer",
  seniority: "SENIOR",
  requirements,
});

describe("Requirements v2 scorer", () => {
  it("resolves production alias normalization before comparing clauses", () => {
    expect(canonicalizeRequirement("Node.js", aliases)).toBe("skill-node");
    const score = scoreRequirements(
      expected([{ priority: "must", value: "Node.js" }]),
      actual([{ priority: "must", value: "node-js" }]),
      aliases,
    );
    expect(score.requirementsF1).toBe(1);
  });

  it("treats anyOf as unordered and canonicalizes duplicate alternatives", () => {
    const score = scoreRequirements(
      expected([{ priority: "must", anyOf: ["React", "Vue.js"] }]),
      actual([{ priority: "must", anyOf: ["vue.js", "React", "React"] }]),
      aliases,
    );
    expect(score.requirementsF1).toBe(1);
    expect(score.alternativeAccuracy).toBe(1);
  });

  it("rejects an anyOf that collapses to one canonical alternative", () => {
    const score = scoreRequirements(
      expected([{ priority: "must", value: "React" }]),
      actual([{ priority: "must", anyOf: ["React", "React"] }]),
      aliases,
    );
    expect(score).toMatchObject({ schemaValid: false, providerFailure: false });
  });

  it("keeps distinct alternatives when the taxonomy incorrectly aliases them together", () => {
    const brokenAliases = new Map([
      ["mysql", "skill-mysql"],
      ["mariadb", "skill-mysql"],
    ]);
    const score = scoreRequirements(
      expected([{ priority: "must", anyOf: ["MySQL", "MariaDB"] }]),
      actual([{ priority: "must", anyOf: ["MariaDB", "MySQL"] }]),
      brokenAliases,
    );
    expect(score).toMatchObject({ schemaValid: true, requirementsF1: 1 });

    const omitted = scoreRequirements(
      expected([{ priority: "must", anyOf: ["MySQL", "MariaDB"] }]),
      actual([{ priority: "must", value: "MySQL" }]),
      brokenAliases,
    );
    expect(omitted.requirementsF1).toBe(0);
  });

  it("keeps priority separate from a matching alternative group", () => {
    const score = scoreRequirements(
      expected([{ priority: "must", value: "TypeScript" }]),
      actual([{ priority: "nice", value: "TypeScript" }]),
      aliases,
    );
    expect(score.requirementsF1).toBe(0);
    expect(score.priorityAccuracy).toBe(0);
    expect(score.alternativeAccuracy).toBe(1);
  });

  it("collapses duplicate clauses and lets must win", () => {
    const score = scoreRequirements(
      expected([{ priority: "must", value: "React" }]),
      actual([
        { priority: "nice", value: "React" },
        { priority: "must", value: "React" },
        { priority: "must", value: "React" },
      ]),
      aliases,
    );
    expect(score.actualClauses).toEqual(["must:skill-react"]);
    expect(score.requirementsPrecision).toBe(1);
  });

  it("penalizes an explicit OR split into separate requirements", () => {
    const score = scoreRequirements(
      expected([{ priority: "must", anyOf: ["React", "Vue.js"] }]),
      actual([
        { priority: "must", value: "React" },
        { priority: "must", value: "Vue.js" },
      ]),
      aliases,
    );
    expect(score).toMatchObject({
      requirementsPrecision: 0,
      requirementsRecall: 0,
      orSplitErrors: 1,
    });
  });

  it("adapts the current flat skills output into singleton Requirements", () => {
    expect(adaptLegacySkills({ required: ["TypeScript"], optional: ["React"] })).toEqual([
      { priority: "must", value: "TypeScript" },
      { priority: "nice", value: "React" },
    ]);
  });

  it("reports provider failures separately from schema failures", () => {
    const provider = scoreRequirements(expected([]), null, aliases, "upstream unavailable");
    const schema = scoreRequirements(
      expected([]),
      {
        isTech: true,
        role: null,
        seniority: null,
        requirements: [{ priority: "must" }],
      } as unknown as ExtractedVacancyForEval,
      aliases,
    );
    expect(provider).toMatchObject({ providerFailure: true, schemaValid: false });
    expect(schema).toMatchObject({ providerFailure: false, schemaValid: false });
    expect(summarizeRequirements([provider, schema]).providerFailureRate).toBe(0.5);
  });
});
