import type { ExtractedVacancy } from "../baml_client";

export const VACANCY_EXTRACTOR = Symbol("VACANCY_EXTRACTOR");

export interface VacancyExtractor {
  extract(text: string): Promise<ExtractedVacancy>;
}

export type { ExtractedVacancy };
