import type { ExtractedVacancy } from "./extracted-vacancy";

export const VACANCY_EXTRACTOR = Symbol("VACANCY_EXTRACTOR");

export interface VacancyExtractor {
  extract(text: string): Promise<ExtractedVacancy>;
}
