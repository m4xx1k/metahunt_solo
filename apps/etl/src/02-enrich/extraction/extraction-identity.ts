import { sha256 } from "../dedup/content-fingerprint";

type SpecHashInput = {
  bamlSourceHash: string;
  bamlVersion: string;
  provider: string;
  model: string;
  taxonomyHash: string;
};

export function buildVacancyExtractionSpecHash(input: SpecHashInput): string {
  return sha256(
    [
      "ExtractVacancy",
      input.bamlSourceHash,
      input.bamlVersion,
      input.provider,
      input.model,
      input.taxonomyHash,
    ].join("|"),
  );
}

export function hashVerifiedTaxonomy(parts: string[]): string {
  return sha256(
    parts
      .flatMap((part) => part.split(", ").filter(Boolean))
      .sort((left, right) => left.localeCompare(right))
      .join("\n"),
  );
}
