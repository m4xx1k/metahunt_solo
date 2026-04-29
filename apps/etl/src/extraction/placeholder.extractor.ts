import { Injectable } from "@nestjs/common";

import type { ExtractedVacancy } from "./extracted-vacancy";
import type { VacancyExtractor } from "./vacancy-extractor";

const PLACEHOLDER: ExtractedVacancy = {
  employment_type: "full-time",
  english_level: "b2",
  experience_years_max: 5,
  experience_years_min: 3,
  salary_currency: "USD",
  salary_max: 8000,
  salary_min: 6000,
  seniority: "senior",
  work_format: "remote",
  skills: ["temporal"],
  specialization: "backend",
};

@Injectable()
export class PlaceholderVacancyExtractor implements VacancyExtractor {
  async extract(): Promise<ExtractedVacancy> {
    return PLACEHOLDER;
  }
}
