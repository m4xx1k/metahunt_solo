import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { BamlVacancyExtractor } from "./baml.extractor";
import { PlaceholderVacancyExtractor } from "./placeholder.extractor";
import { VACANCY_EXTRACTOR } from "./vacancy-extractor";

type Provider = "baml" | "placeholder";
const VALID_PROVIDERS: readonly Provider[] = ["baml", "placeholder"] as const;

@Module({
  providers: [
    BamlVacancyExtractor,
    PlaceholderVacancyExtractor,
    {
      provide: VACANCY_EXTRACTOR,
      inject: [ConfigService, BamlVacancyExtractor, PlaceholderVacancyExtractor],
      useFactory: (
        config: ConfigService,
        baml: BamlVacancyExtractor,
        placeholder: PlaceholderVacancyExtractor,
      ) => {
        const raw = config.get<string>("EXTRACTOR_PROVIDER") ?? "placeholder";
        if (!(VALID_PROVIDERS as readonly string[]).includes(raw)) {
          throw new Error(
            `Unknown EXTRACTOR_PROVIDER="${raw}". Valid: ${VALID_PROVIDERS.join(", ")}`,
          );
        }
        const provider = raw as Provider;
        return provider === "baml" ? baml : placeholder;
      },
    },
  ],
  exports: [VACANCY_EXTRACTOR],
})
export class ExtractionModule {}
