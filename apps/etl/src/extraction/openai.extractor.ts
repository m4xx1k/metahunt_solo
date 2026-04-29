import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

import {
  EXTRACT_VACANCY_JSON_SCHEMA,
  ExtractedVacancy,
} from "./extracted-vacancy";
import type { VacancyExtractor } from "./vacancy-extractor";

const TOOL_NAME = "extract_vacancy";
const DEFAULT_MODEL = "gpt-4o-mini";

@Injectable()
export class OpenAiVacancyExtractor implements VacancyExtractor {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.client = new OpenAI({
      apiKey: config.get<string>("OPENAI_API_KEY"),
    });
    this.model = config.get<string>("OPENAI_MODEL") ?? DEFAULT_MODEL;
  }

  async extract(text: string): Promise<ExtractedVacancy> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: text }],
      tools: [
        {
          type: "function",
          function: {
            name: TOOL_NAME,
            description:
              "Extract structured vacancy data from job posting text",
            parameters: EXTRACT_VACANCY_JSON_SCHEMA,
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: TOOL_NAME },
      },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function") {
      throw new Error("No function tool_call in OpenAI response");
    }

    const args: unknown = JSON.parse(toolCall.function.arguments);
    return ExtractedVacancy.parse(args);
  }
}
