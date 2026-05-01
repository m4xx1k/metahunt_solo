import { Injectable } from "@nestjs/common";

import {
  EmploymentType,
  EnglishLevel,
  EngagementType,
  Seniority,
  WorkFormat,
} from "../baml_client";
import type { ExtractedVacancy } from "../baml_client";
import type { VacancyExtractor } from "./vacancy-extractor";

const PLACEHOLDER: ExtractedVacancy = {
  role: "Backend Developer",
  seniority: Seniority.SENIOR,
  skills: {
    required: ["TypeScript", "PostgreSQL"],
    optional: ["Temporal"],
  },
  experienceYears: 3,
  salary: { min: 6000, max: 8000, currency: null },
  englishLevel: EnglishLevel.UPPER_INTERMEDIATE,
  employmentType: EmploymentType.FULL_TIME,
  workFormat: WorkFormat.REMOTE,
  locations: [],
  domain: null,
  engagementType: EngagementType.PRODUCT,
  companyName: null,
  hasTestAssignment: false,
  hasReservation: false,
};

@Injectable()
export class PlaceholderVacancyExtractor implements VacancyExtractor {
  async extract(): Promise<ExtractedVacancy> {
    return PLACEHOLDER;
  }
}
