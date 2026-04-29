import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";

jest.mock("openai", () => {
  const ctor = jest.fn();
  return { __esModule: true, default: ctor };
});

import OpenAI from "openai";

import { OpenAiVacancyExtractor } from "./openai.extractor";

const OPENAI_CTOR = OpenAI as unknown as jest.Mock;

const validToolArgs = {
  salary_min: 6000,
  salary_max: 8000,
  salary_currency: "USD",
  experience_years_min: 3,
  experience_years_max: 5,
  employment_type: "full-time",
  work_format: "remote",
  skills: ["Node.js", "TypeScript"],
  english_level: "b2",
  seniority: "senior",
  specialization: "backend",
};

describe("OpenAiVacancyExtractor", () => {
  let create: jest.Mock;

  async function bootstrap() {
    create = jest.fn();
    OPENAI_CTOR.mockReset().mockImplementation(() => ({
      chat: { completions: { create } },
    }));

    const moduleRef = await Test.createTestingModule({
      providers: [
        OpenAiVacancyExtractor,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                OPENAI_API_KEY: "sk-test",
                OPENAI_MODEL: "gpt-4o-mini",
              })[key],
          },
        },
      ],
    }).compile();
    return moduleRef.get(OpenAiVacancyExtractor);
  }

  it("parses extract_vacancy tool call into ExtractedVacancy", async () => {
    const extractor = await bootstrap();
    create.mockResolvedValue({
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: "extract_vacancy",
                  arguments: JSON.stringify(validToolArgs),
                },
              },
            ],
          },
        },
      ],
    });

    const result = await extractor.extract("Title: Backend\n\nDesc");

    expect(result).toEqual(validToolArgs);
    const callArg = create.mock.calls[0][0];
    expect(callArg.model).toBe("gpt-4o-mini");
    expect(callArg.tool_choice).toEqual({
      type: "function",
      function: { name: "extract_vacancy" },
    });
    expect(callArg.tools[0].function.name).toBe("extract_vacancy");
  });

  it("throws when response has no function tool_call", async () => {
    const extractor = await bootstrap();
    create.mockResolvedValue({
      choices: [{ message: { content: "no tool call here", tool_calls: [] } }],
    });

    await expect(extractor.extract("Title: Backend")).rejects.toThrow(
      /No function tool_call/,
    );
  });
});
