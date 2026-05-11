import { Injectable } from "@nestjs/common";
import { Collector } from "@boundaryml/baml";

import { b } from "../baml_client";
import type {
  ExtractionResult,
  ExtractionUsage,
  VacancyExtractor,
} from "./vacancy-extractor";

export const PROMPT_VERSION = 2;

@Injectable()
export class BamlVacancyExtractor implements VacancyExtractor {
  async extract(text: string): Promise<ExtractionResult> {
    const collector = new Collector("vacancy-extract");

    try {
      const data = await b.ExtractVacancy(text, { collector });
      return {
        data,
        meta: { promptVersion: PROMPT_VERSION, usage: readUsage(collector) },
      };
    } catch (err) {
      // BAML attaches `detailed_message` (full prompt + raw LLM response) to
      // its errors. Temporal logs the entire error on activity failure — that
      // is a lot of log volume per record. Keep the gist only; set
      // BAML_LOG=DEBUG locally for the full payload.
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      return {
        data: null,
        meta: {
          promptVersion: PROMPT_VERSION,
          usage: readUsage(collector),
          error: `BAML extraction: ${msg}`,
        },
      };
    }
  }
}

function readUsage(collector: Collector): ExtractionUsage {
  const u = collector.usage;
  const last = collector.last;
  const call = last?.calls?.[0];
  return {
    in: u.inputTokens ?? 0,
    out: u.outputTokens ?? 0,
    cached: u.cachedInputTokens ?? 0,
    client: call?.clientName ?? "unknown",
    provider: call?.provider ?? "unknown",
    ms: last?.timing?.durationMs ?? null,
  };
}
