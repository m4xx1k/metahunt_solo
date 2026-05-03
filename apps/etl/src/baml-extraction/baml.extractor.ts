import { Injectable } from "@nestjs/common";

import { b } from "../baml_client";
import type { ExtractedVacancy } from "../baml_client";
import type { VacancyExtractor } from "../extraction/vacancy-extractor";

@Injectable()
export class BamlVacancyExtractor implements VacancyExtractor {
  async extract(text: string): Promise<ExtractedVacancy> {
    try {
      return await b.ExtractVacancy(text);
    } catch (err) {
      // BAML attaches `detailed_message` (full prompt + raw LLM response) to
      // its errors. Temporal's worker logs the entire error object on activity
      // failure — multiplied by 17 fires/day × N records that's a lot of log
      // volume on Railway. Re-throw a plain Error with only the gist so the
      // failure log stays terse. For local debugging, set BAML_LOG=DEBUG.
      if (err instanceof Error) {
        throw new Error(`BAML extraction: ${err.message.split("\n")[0]}`);
      }
      throw err;
    }
  }
}
