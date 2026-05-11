import { Test } from "@nestjs/testing";

jest.mock("../baml_client", () => ({
  __esModule: true,
  b: { ExtractVacancy: jest.fn() },
}));

import { DRIZZLE } from "@metahunt/database";
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

function buildDbMock(rows: Array<{ type: string; name: string }>) {
  const where = jest.fn().mockResolvedValue(rows);
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });
  return { select, where, from };
}

describe("BamlVacancyExtractor", () => {
  async function bootstrap(
    rows: Array<{ type: string; name: string }> = [
      { type: "ROLE", name: "Backend Developer" },
      { type: "ROLE", name: "Frontend Developer" },
      { type: "DOMAIN", name: "Fintech" },
      { type: "SKILL", name: "TypeScript" }, // should be filtered out
    ],
  ) {
    extractVacancy.mockReset();
    const db = buildDbMock(rows);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BamlVacancyExtractor,
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();
    return { extractor: moduleRef.get(BamlVacancyExtractor), db };
  }

  it("passes alphabetised canonical roles + domains to BAML and returns usage meta", async () => {
    const { extractor } = await bootstrap();
    extractVacancy.mockResolvedValue(sampleVacancy);

    const result = await extractor.extract("Senior Backend Developer ...");

    expect(result.data).toEqual(sampleVacancy);
    expect(result.meta.promptVersion).toBe(PROMPT_VERSION);
    expect(result.meta.error).toBeUndefined();
    expect(result.meta.usage).toMatchObject({ in: 0, out: 0, cached: 0 });

    expect(extractVacancy).toHaveBeenCalledTimes(1);
    const [text, roles, domains, options] = extractVacancy.mock.calls[0];
    expect(text).toBe("Senior Backend Developer ...");
    expect(roles).toBe("Backend Developer, Frontend Developer");
    expect(domains).toBe("Fintech");
    expect(options).toHaveProperty("collector");
  });

  it("caches the taxonomy between calls (one DB query per TTL window)", async () => {
    const { extractor, db } = await bootstrap();
    extractVacancy.mockResolvedValue(sampleVacancy);

    await extractor.extract("first");
    await extractor.extract("second");

    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("returns null data + error meta when BAML throws", async () => {
    const { extractor } = await bootstrap();
    extractVacancy.mockRejectedValue(new Error("LLM call failed"));

    const result = await extractor.extract("…");

    expect(result.data).toBeNull();
    expect(result.meta.promptVersion).toBe(PROMPT_VERSION);
    expect(result.meta.error).toBe("BAML extraction: LLM call failed");
    expect(result.meta.usage).toMatchObject({ in: 0, out: 0, cached: 0 });
  });

  it("emits empty hint strings when no verified nodes exist", async () => {
    const { extractor } = await bootstrap([]);
    extractVacancy.mockResolvedValue(sampleVacancy);

    await extractor.extract("…");
    const [, roles, domains] = extractVacancy.mock.calls[0];
    expect(roles).toBe("");
    expect(domains).toBe("");
  });
});
