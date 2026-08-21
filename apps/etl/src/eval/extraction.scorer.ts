import { z } from "zod";

import { normalizeAliasName } from "../platform/shared/normalize-alias";

import type {
  ExtractedVacancyForEval,
  LegacySkills,
  Requirement,
  RequirementDatasetCase,
  RequirementScore,
  RequirementsSummary,
  ScorerAliasMap,
} from "./extraction-eval.types";

const requirementSchema = z
  .object({
    priority: z.enum(["must", "nice"]),
    value: z.string().min(1).optional(),
    anyOf: z.array(z.string().min(1)).min(2).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.value ? 1 : 0) + (value.anyOf ? 1 : 0) !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "requirement needs exactly one of value or anyOf",
      });
    }
  });

const extractionSchema = z.object({
  isTech: z.boolean(),
  role: z.string().nullable(),
  seniority: z.string().nullable(),
  skills: z
    .object({ required: z.array(z.string()).optional(), optional: z.array(z.string()).optional() })
    .nullable()
    .optional(),
  requirements: z.array(requirementSchema).nullable().optional(),
});

type NormalizedClause = {
  priority: "must" | "nice";
  alternatives: string[];
  key: string;
  alternativesKey: string;
};

export function adaptLegacySkills(skills: LegacySkills | null | undefined): Requirement[] {
  return [
    ...(skills?.required ?? []).map((value) => ({ priority: "must" as const, value })),
    ...(skills?.optional ?? []).map((value) => ({ priority: "nice" as const, value })),
  ];
}

/**
 * Resolve aliases with production's normalization. Unknown values remain stable so
 * draft labels can be scored before the taxonomy is fully curated.
 */
export function canonicalizeRequirement(name: string, aliases: ScorerAliasMap): string {
  const normalized = normalizeAliasName(name);
  return aliases.get(normalized) ?? `unresolved:${normalized}`;
}

export function scoreRequirements(
  expected: RequirementDatasetCase["expectedOutput"],
  actual: ExtractedVacancyForEval | null,
  aliases: ScorerAliasMap = new Map(),
  providerError?: string,
): RequirementScore {
  if (providerError || actual === null)
    return failureScore(true, providerError ?? "extractor returned no data");

  const parsed = extractionSchema.safeParse(actual);
  if (!parsed.success)
    return failureScore(false, parsed.error.issues.map((item) => item.message).join("; "));

  const actualRequirements = (parsed.data.requirements ??
    adaptLegacySkills(parsed.data.skills)) as Requirement[];
  const invalidAnyOf = actualRequirements.find(
    (requirement) =>
      "anyOf" in requirement && new Set(requirement.anyOf.map(normalizeAliasName)).size < 2,
  );
  if (invalidAnyOf) {
    return failureScore(false, "anyOf must contain at least two distinct canonical requirements");
  }
  const expectedClauses = normalizeClauses(expected.requirements, aliases);
  const actualClauses = normalizeClauses(actualRequirements, aliases);
  const expectedKeys = new Set(expectedClauses.map((item) => item.key));
  const actualKeys = new Set(actualClauses.map((item) => item.key));
  const truePositives = [...actualKeys].filter((key) => expectedKeys.has(key)).length;
  const precision = fraction(truePositives, actualKeys.size);
  const recall = fraction(truePositives, expectedKeys.size);
  const alternativeMatches = expectedClauses.filter((expectedClause) =>
    actualClauses.some(
      (actualClause) => actualClause.alternativesKey === expectedClause.alternativesKey,
    ),
  );
  const priorityAccuracy = fraction(
    alternativeMatches.filter((expectedClause) =>
      actualClauses.some(
        (actualClause) =>
          actualClause.alternativesKey === expectedClause.alternativesKey &&
          actualClause.priority === expectedClause.priority,
      ),
    ).length,
    alternativeMatches.length,
  );

  return {
    schemaValid: true,
    providerFailure: false,
    requirementsPrecision: precision,
    requirementsRecall: recall,
    requirementsF1: f1(precision, recall),
    priorityAccuracy,
    alternativeAccuracy: fraction(alternativeMatches.length, expectedClauses.length),
    orSplitErrors: countOrSplitErrors(expectedClauses, actualClauses),
    guardAccuracy: {
      isTech: Number(parsed.data.isTech === expected.isTech),
      role: Number(parsed.data.role === expected.role),
      seniority: Number(parsed.data.seniority === expected.seniority),
    },
    expectedClauses: [...expectedKeys].sort(),
    actualClauses: [...actualKeys].sort(),
  };
}

export function summarizeRequirements(scores: RequirementScore[]): RequirementsSummary {
  return {
    evaluatedCases: scores.length,
    schemaValidRate: average(scores.map((item) => Number(item.schemaValid))),
    providerFailureRate: average(scores.map((item) => Number(item.providerFailure))),
    requirementsPrecision: average(scores.map((item) => item.requirementsPrecision)),
    requirementsRecall: average(scores.map((item) => item.requirementsRecall)),
    requirementsF1: average(scores.map((item) => item.requirementsF1)),
    priorityAccuracy: average(scores.map((item) => item.priorityAccuracy)),
    alternativeAccuracy: average(scores.map((item) => item.alternativeAccuracy)),
    orSplitErrors: scores.reduce((total, item) => total + item.orSplitErrors, 0),
    guardAccuracy: {
      isTech: average(scores.map((item) => item.guardAccuracy.isTech)),
      role: average(scores.map((item) => item.guardAccuracy.role)),
      seniority: average(scores.map((item) => item.guardAccuracy.seniority)),
    },
  };
}

function normalizeClauses(
  requirements: Requirement[],
  aliases: ScorerAliasMap,
): NormalizedClause[] {
  const byAlternatives = new Map<string, NormalizedClause>();
  for (const requirement of requirements) {
    const values = "value" in requirement ? [requirement.value] : requirement.anyOf;
    const rawAlternatives = values.map(normalizeAliasName);
    const canonicalAlternatives = values.map((value) => canonicalizeRequirement(value, aliases));
    const canonicalRawValues = canonicalAlternatives.reduce<Map<string, Set<string>>>(
      (valuesByCanonical, value, index) => {
        const rawValues = valuesByCanonical.get(value) ?? new Set<string>();
        rawValues.add(rawAlternatives[index]);
        valuesByCanonical.set(value, rawValues);
        return valuesByCanonical;
      },
      new Map(),
    );
    // A bad taxonomy alias must not erase a real source-level alternative such
    // as MySQL OR MariaDB. Preserve raw identities only for canonical collisions.
    const alternatives = canonicalAlternatives
      .map((value, index) =>
        (canonicalRawValues.get(value)?.size ?? 0) > 1 ? `raw:${rawAlternatives[index]}` : value,
      )
      .sort();
    const uniqueAlternatives = [...new Set(alternatives)];
    const alternativesKey = uniqueAlternatives.join("|");
    const clause: NormalizedClause = {
      priority: requirement.priority,
      alternatives: uniqueAlternatives,
      alternativesKey,
      key: `${requirement.priority}:${alternativesKey}`,
    };
    const existing = byAlternatives.get(alternativesKey);
    if (!existing || clause.priority === "must") byAlternatives.set(alternativesKey, clause);
  }
  return [...byAlternatives.values()];
}

function countOrSplitErrors(expected: NormalizedClause[], actual: NormalizedClause[]): number {
  const actualSingletons = new Set(
    actual.filter((item) => item.alternatives.length === 1).map((item) => item.alternatives[0]),
  );
  return expected.filter(
    (item) =>
      item.alternatives.length > 1 &&
      item.alternatives.every((alternative) => actualSingletons.has(alternative)),
  ).length;
}

function failureScore(providerFailure: boolean, error: string): RequirementScore {
  return {
    schemaValid: false,
    providerFailure,
    requirementsPrecision: 0,
    requirementsRecall: 0,
    requirementsF1: 0,
    priorityAccuracy: 0,
    alternativeAccuracy: 0,
    orSplitErrors: 0,
    guardAccuracy: { isTech: 0, role: 0, seniority: 0 },
    expectedClauses: [],
    actualClauses: [],
    error,
  };
}

function fraction(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function f1(precision: number, recall: number): number {
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}
