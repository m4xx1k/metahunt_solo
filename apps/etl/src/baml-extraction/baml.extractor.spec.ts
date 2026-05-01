import { Test } from "@nestjs/testing";

jest.mock("../baml_client", () => ({
  __esModule: true,
  b: { ExtractVacancy: jest.fn() },
}));

import { b } from "../baml_client";
import type { ExtractedVacancy } from "../baml_client";

import { BamlVacancyExtractor } from "./baml.extractor";

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

  it("returns the BAML-parsed structure verbatim", async () => {
    const extractor = await bootstrap();
    extractVacancy.mockResolvedValue(sampleVacancy);

    const result = await extractor.extract("Senior Backend Developer ...");

    expect(result).toEqual(sampleVacancy);
    expect(extractVacancy).toHaveBeenCalledWith("Senior Backend Developer ...");
    expect(extractVacancy).toHaveBeenCalledTimes(1);
  });

  it("propagates errors from the BAML client", async () => {
    const extractor = await bootstrap();
    extractVacancy.mockRejectedValue(new Error("LLM call failed"));

    await expect(extractor.extract("…")).rejects.toThrow("LLM call failed");
  });
});
