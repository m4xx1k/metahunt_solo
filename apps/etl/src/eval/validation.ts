import {
  FIELDS,
  type CandidatesFile,
  type DatasetFile,
  type DecisionsFile,
  type Extraction,
  type LabelFile,
} from "./types";

type ValidationInput = {
  dataset: DatasetFile;
  decisions: DecisionsFile;
  candidates: CandidatesFile;
  arbiter?: LabelFile;
};

const CURRENCIES = new Set(["USD", "EUR", "UAH"]);

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
