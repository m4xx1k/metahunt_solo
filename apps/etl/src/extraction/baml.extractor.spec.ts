import { Test } from "@nestjs/testing";

jest.mock("../baml_client", () => ({
  __esModule: true,
  b: { ExtractVacancy: jest.fn() },
}));

import { b } from "../baml_client";
import type { ExtractedVacancy } from "../baml_client";

import { BamlVacancyExtractor, PROMPT_VERSION } from "./baml.extractor";

const extractVacancy = b.ExtractVacancy as unknown as jest.Mock;

// Plain object cast to ExtractedVacancy: BAML enums are `enum X { SENIOR = "SENIOR" }`
// at runtime, so string literals match the enum members structurally in TS.
const sampleVacancy = {
  role: "Backend Developer",
  seniority: "SENIOR",
  skills: {
    required: ["Node.js", "TypeScript", "PostgreSQL"],
    optional: ["AWS"],
  },
  experienceYears: 3,
  salary: { min: 6000, max: 8000, currency: "USD" },
  englishLevel: "UPPER_INTERMEDIATE",
  employmentType: "FULL_TIME",
  workFormat: "REMOTE",
  locations: [{ city: "Kyiv", country: "Ukraine" }],
  domain: "Fintech",
  engagementType: "PRODUCT",
  companyName: "Bolt",
  hasTestAssignment: true,
  hasReservation: true,
} as unknown as ExtractedVacancy;

describe("BamlVacancyExtractor", () => {
  async function bootstrap() {
    extractVacancy.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [BamlVacancyExtractor],
    }).compile();
    return moduleRef.get(BamlVacancyExtractor);
  }

  it("returns the BAML-parsed structure with usage metadata on success", async () => {
    const extractor = await bootstrap();
    extractVacancy.mockResolvedValue(sampleVacancy);

    const result = await extractor.extract("Senior Backend Developer ...");

    expect(result.data).toEqual(sampleVacancy);
    expect(result.meta.promptVersion).toBe(PROMPT_VERSION);
    expect(result.meta.error).toBeUndefined();
    // No real LLM call in tests → all token counters are 0.
    expect(result.meta.usage).toMatchObject({
      in: 0,
      out: 0,
      cached: 0,
    });

    expect(extractVacancy).toHaveBeenCalledTimes(1);
    // First positional arg is the input text; second is the BAML call options
    // bag carrying the collector — we don't assert the collector identity.
    expect(extractVacancy.mock.calls[0][0]).toBe("Senior Backend Developer ...");
    expect(extractVacancy.mock.calls[0][1]).toHaveProperty("collector");
  });

  it("returns a null data + error meta when the BAML client throws", async () => {
    const extractor = await bootstrap();
    extractVacancy.mockRejectedValue(new Error("LLM call failed"));

    const result = await extractor.extract("…");

    expect(result.data).toBeNull();
    expect(result.meta.promptVersion).toBe(PROMPT_VERSION);
    expect(result.meta.error).toBe("BAML extraction: LLM call failed");
    expect(result.meta.usage).toMatchObject({ in: 0, out: 0, cached: 0 });
  });
});
