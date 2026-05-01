import { Module } from "@nestjs/common";

import { BamlVacancyExtractor } from "./baml.extractor";

@Module({
  providers: [BamlVacancyExtractor],
  exports: [BamlVacancyExtractor],
})
export class BamlExtractionModule {}
