import type { ExtractedVacancy } from "../baml_client";

export const FIELDS = [
  "isTech",
  "role",
  "seniority",
  "skills",
  "experienceYears",
  "salary",
  "englishLevel",
  "employmentType",
  "workFormat",
  "locations",
  "domain",
  "engagementType",
  "companyName",
  "hasTestAssignment",
  "hasReservation",
] as const satisfies readonly (keyof ExtractedVacancy)[];

export type Field = (typeof FIELDS)[number];

// Sidecar keys `RssExtractActivity` merges alongside the extraction. `Partial` because
// rows predating a field (isTech) or a failed run carry only some of them.
export type Extraction = Partial<ExtractedVacancy> & {
  _v?: number;
  _usage?: Record<string, unknown>;
  _error?: string;
};

export type ManifestEntry = {
  id: string;
  source: string;
  category: string;
  title: string;
  link: string | null;
  publishedAt: string;
  cells: string[];
};

export type CoverageCell = { cell: string; picked: number; pool: number; cap: number };

export type Manifest = {
  generatedAt: string;
  size: number;
  poolSize: number;
  coverage: CoverageCell[];
  entries: ManifestEntry[];
};
