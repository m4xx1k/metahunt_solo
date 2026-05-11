import type { ExtractedVacancy } from "../baml_client";

export const VACANCY_EXTRACTOR = Symbol("VACANCY_EXTRACTOR");

export type ExtractionUsage = {
  in: number;
  out: number;
  cached: number;
  client: string;
  provider: string;
  ms: number | null;
};

export type ExtractionResult = {
  data: ExtractedVacancy | null;
  meta: {
    promptVersion: number;
    usage: ExtractionUsage;
    error?: string;
  };
};

export interface VacancyExtractor {
  extract(text: string): Promise<ExtractionResult>;
}

export type { ExtractedVacancy };
