import { Injectable } from "@nestjs/common";

import { b } from "../baml_client";
import type { ExtractedVacancy } from "../baml_client";
import type { VacancyExtractor } from "../extraction/vacancy-extractor";

@Injectable()
export class BamlVacancyExtractor implements VacancyExtractor {
  async extract(text: string): Promise<ExtractedVacancy> {
    return b.ExtractVacancy(text);
  }
}
