import { Injectable } from "@nestjs/common";

import {
  EmploymentType,
  EnglishLevel,
  EngagementType,
  Seniority,
  WorkFormat,
} from "../baml_client";
import type { ExtractedVacancy } from "../baml_client";
import type {
  ExtractionResult,
  VacancyExtractor,
} from "./vacancy-extractor";

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
  async extract(): Promise<ExtractionResult> {
    return {
      data: PLACEHOLDER,
      meta: {
        // 0 = no real prompt; only the BAML extractor reports a real version.
        promptVersion: 0,
        usage: {
          in: 0,
          out: 0,
          cached: 0,
          client: "placeholder",
          provider: "none",
          model: "none",
          ms: 0,
        },
      },
    };
  }
}
