import type { ExtractedVacancy } from "../../baml_client";

export const VACANCY_EXTRACTOR = Symbol("VACANCY_EXTRACTOR");

export type ExtractionUsage = {
  in: number;
  out: number;
  cached: number;
  client: string; // BAML client name (e.g. "OpenAIClient")
  provider: string; // BAML provider (e.g. "openai")
  model: string; // Actual model name (e.g. "gpt-5.4-mini"), from env at call time
  ms: number | null;
};

export type ExtractionResult = {
  data: ExtractedVacancy | null;
  meta: {
    promptVersion: number;
    usage: ExtractionUsage;
    error?: string;
  };
  cache?: ExtractionIdentity & { artifactId: string; hit: boolean };
};

export type ExtractionIdentity = {
  specHash: string;
  inputHash: string;
  provider: string;
  model: string;
  bamlVersion: string;
  bamlSourceHash: string;
  taxonomyHash: string;
};

export interface VacancyExtractor {
  extract(text: string): Promise<ExtractionResult>;
  identity(text: string): Promise<ExtractionIdentity>;
}

export type { ExtractedVacancy };
