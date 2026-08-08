import { sha256 } from "./snapshot";
import {
  FIELDS,
  NOT_SCORABLE_REASONS,
  type CandidatesFile,
  type DatasetFile,
  type DecisionsFile,
  type EvaluationSnapshot,
  type Extraction,
  type Field,
  type LabelFile,
  type RunProvenance,
} from "./types";

type ValidationInput = {
  dataset: DatasetFile;
  decisions: DecisionsFile;
  candidates: CandidatesFile;
  arbiter?: LabelFile;
};

const CURRENCIES = new Set(["USD", "EUR", "UAH"]);
const FIELD_SET = new Set<string>(FIELDS);
const EXCLUSION_REASONS = new Set<string>(NOT_SCORABLE_REASONS);

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateExtraction(id: string, values: Extraction): string[] {
  const errors: string[] = [];
  for (const field of FIELDS) {
    if (!(field in values)) errors.push(`${id}: missing ${field}`);
  }

  const skills = values.skills;
  if (!skills || typeof skills !== "object" || Array.isArray(skills)) {
    errors.push(`${id}: skills must be an object`);
  } else {
    for (const key of ["required", "optional"] as const) {
      const list = skills[key];
      if (!Array.isArray(list) || !list.every((skill) => typeof skill === "string")) {
        errors.push(`${id}: skills.${key} must be a string array`);
        continue;
      }
      const limit = key === "required" ? 10 : 5;
      if (list.length > limit) errors.push(`${id}: skills.${key} exceeds ${limit}`);
    }
  }

  const salary = values.salary;
  if (salary !== null && salary !== undefined) {
    if (typeof salary !== "object" || Array.isArray(salary)) {
      errors.push(`${id}: salary must be an object or null`);
    } else if (
      salary.currency !== null &&
      salary.currency !== undefined &&
      !CURRENCIES.has(salary.currency)
    ) {
      errors.push(`${id}: salary.currency must be USD, EUR, UAH, or null`);
    }
  }

  if (!Array.isArray(values.locations)) {
    errors.push(`${id}: locations must be an array`);
  } else if (
    values.locations.some(
      (location) =>
        !location || typeof location.city !== "string" || typeof location.country !== "string",
    )
  ) {
    errors.push(`${id}: locations entries must have city and country strings`);
  }

  return errors;
}

export function validateGolden(input: ValidationInput): string[] {
  const errors: string[] = [];
  const rowIds = new Set<string>();

  for (const row of input.dataset.rows) {
    if (rowIds.has(row.id)) errors.push(`${row.id}: duplicate dataset row`);
    rowIds.add(row.id);
    errors.push(...validateExtraction(row.id, row.values));

    const decision = input.decisions.decisions[row.id];
    if (!decision?.approved) {
      errors.push(`${row.id}: dataset row has no approved decision`);
    } else if (!same(row.values, decision.values)) {
      errors.push(`${row.id}: dataset values differ from approved decision snapshot`);
    }
    if (!same(row.exclusions ?? {}, decision?.exclusions ?? {})) {
      errors.push(`${row.id}: dataset exclusions differ from approved decision snapshot`);
    }
    for (const [field, exclusion] of Object.entries(decision?.exclusions ?? {})) {
      if (!FIELD_SET.has(field)) {
        errors.push(`${row.id}: exclusion references unknown field ${field}`);
        continue;
      }
      if (!exclusion || !EXCLUSION_REASONS.has(exclusion.reason)) {
        errors.push(`${row.id}: ${field} exclusion has an invalid reason`);
      }
      if (!exclusion?.evidence?.trim()) {
        errors.push(`${row.id}: ${field} exclusion needs source evidence`);
      }
    }
  }

  if (input.arbiter) {
    const candidates = new Map(
      input.candidates.candidates.map((candidate) => [candidate.id, candidate]),
    );
    for (const label of input.arbiter.labels) {
      const candidate = candidates.get(label.id);
      if (!candidate) {
        errors.push(`${label.id}: arbiter label has no candidate`);
        continue;
      }
      for (const [field, value] of Object.entries(label.values)) {
        const candidateField = candidate.fields[field];
        if (!candidateField || !same(candidateField.arbiter, value ?? null)) {
          errors.push(`${label.id}: candidate arbiter value for ${field} is stale`);
        }
      }
    }
  }

  return errors;
}

/**
 * A structural artifact can be inspected while it is still legacy. This stricter
 * gate is the one a new release must pass before its score can be compared.
 */
export function validateRelease(input: ValidationInput): string[] {
  const errors = validateGolden(input);
  const candidates = new Map(
    input.candidates.candidates.map((candidate) => [candidate.id, candidate]),
  );

  for (const row of input.dataset.rows) {
    const candidate = candidates.get(row.id);
    const decision = input.decisions.decisions[row.id];
    if (!candidate || !decision?.approved) continue;

    for (const [field, value] of Object.entries(decision.overrides)) {
      if (!FIELD_SET.has(field)) {
        errors.push(`${row.id}: override references unknown field ${field}`);
        continue;
      }
      const knownField = field as Field;
      const candidateValue = candidate.fields[field]?.value;
      if (same(value, candidateValue) || decision.exclusions?.[knownField]) continue;
      const rationale = decision.rationales?.[knownField];
      if (!rationale?.evidence?.trim()) {
        errors.push(`${row.id}: ${field} override needs review rationale`);
        continue;
      }
      if (
        !["adopted-arbiter", "superseded-arbiter", "manual-ruling"].includes(rationale.disposition)
      ) {
        errors.push(`${row.id}: ${field} rationale has an invalid disposition`);
      }
    }
  }
  return errors;
}

export function validateRunProvenance(
  name: string,
  provenance: RunProvenance,
  snapshot: EvaluationSnapshot,
): string[] {
  const errors: string[] = [];
  if (provenance.run !== name)
    errors.push(`run provenance names ${provenance.run}, expected ${name}`);
  for (const field of ["createdAt", "provider", "model", "pipelineCommit"] as const) {
    if (!provenance[field]?.trim()) errors.push(`run provenance is missing ${field}`);
  }
  if (provenance.runner !== "agent" && provenance.runner !== "baml") {
    errors.push("run provenance runner must be agent or baml");
  }
  const expected = {
    corpusSha256: snapshot.corpusSha256,
    promptVersion: snapshot.prompt.version,
    promptSourceSha256: snapshot.prompt.sourceSha256,
    taxonomySha256: sha256(JSON.stringify(snapshot.taxonomy)),
    aliasesSha256: sha256(JSON.stringify(snapshot.aliases)),
  };
  for (const [field, value] of Object.entries(expected)) {
    if (provenance.snapshot[field as keyof typeof expected] !== value) {
      errors.push(`run provenance ${field} does not match evaluation snapshot`);
    }
  }
  return errors;
}
