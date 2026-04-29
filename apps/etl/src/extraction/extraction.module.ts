import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { OpenAiVacancyExtractor } from "./openai.extractor";
import { PlaceholderVacancyExtractor } from "./placeholder.extractor";
import { VACANCY_EXTRACTOR } from "./vacancy-extractor";

@Module({
  providers: [
    OpenAiVacancyExtractor,
    PlaceholderVacancyExtractor,
    {
      provide: VACANCY_EXTRACTOR,
      inject: [ConfigService, OpenAiVacancyExtractor, PlaceholderVacancyExtractor],
      useFactory: (
        config: ConfigService,
        openAi: OpenAiVacancyExtractor,
        placeholder: PlaceholderVacancyExtractor,
      ) => {
        const enabled =
          config.get<boolean>("LLM_EXTRACTION_ENABLED") === true;
        return enabled ? openAi : placeholder;
      },
    },
  ],
  exports: [VACANCY_EXTRACTOR],
})
export class ExtractionModule {}
