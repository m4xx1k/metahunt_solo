import { Test } from "@nestjs/testing";

import { DRIZZLE, schema } from "@metahunt/database";
import type { ExtractedVacancy } from "../../baml_client";
import {
  VACANCY_EXTRACTOR,
  type ExtractionResult,
  type ExtractionUsage,
  type VacancyExtractor,
} from "../../extraction/vacancy-extractor";

import { RssExtractActivity } from "./rss-extract.activity";

const RECORD_ID = "33333333-3333-3333-3333-333333333333";
const SOURCE_ID = "11111111-1111-1111-1111-111111111111";

const baseRecord = {
  id: RECORD_ID,
  sourceId: SOURCE_ID,
  rssIngestId: "ingest-1",
  externalId: "ext-1",
  hash: "hash-1",
  publishedAt: new Date(),
  title: "Senior Backend Engineer",
  description: "Node.js + TypeScript",
  link: "https://example.com/jobs/1",
  category: "Backend",
  extractedData: null,
  extractedAt: null,
  createdAt: new Date(),
};

const sampleExtract = {
  role: "Backend Developer",
  seniority: "SENIOR",
  skills: { required: ["Node.js", "TypeScript"], optional: [] },
  experienceYears: 3,
  salary: { min: 6000, max: 8000, currency: "USD" },
  englishLevel: "UPPER_INTERMEDIATE",
  employmentType: "FULL_TIME",
  workFormat: "REMOTE",
  locations: [],
  domain: null,
  engagementType: "PRODUCT",
  companyName: null,
  hasTestAssignment: false,
  hasReservation: false,
} as unknown as ExtractedVacancy;

const sampleUsage: ExtractionUsage = {
  in: 1200,
  out: 350,
  cached: 0,
  client: "OpenAIClient",
  provider: "openai",
  ms: 1800,
};

const successResult: ExtractionResult = {
  data: sampleExtract,
  meta: { promptVersion: 2, usage: sampleUsage },
};

const failureResult: ExtractionResult = {
  data: null,
  meta: {
    promptVersion: 2,
    usage: { ...sampleUsage, out: 0 },
    error: "BAML extraction: boom",
  },
};

function buildDbMocks(record: unknown) {
  const selectWhere = jest.fn().mockResolvedValue(record ? [record] : []);
  const selectFrom = jest.fn().mockReturnValue({ where: selectWhere });
  const select = jest.fn().mockReturnValue({ from: selectFrom });

  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
  const update = jest.fn().mockReturnValue({ set: updateSet });

  return {
    db: { select, update },
    selectWhere,
    updateSet,
    updateWhere,
  };
}

describe("RssExtractActivity", () => {
  const extractor: jest.Mocked<VacancyExtractor> = {
    extract: jest.fn(),
  };

  async function bootstrap(record: unknown) {
    const mocks = buildDbMocks(record);
    const moduleRef = await Test.createTestingModule({
      providers: [
        RssExtractActivity,
        { provide: DRIZZLE, useValue: mocks.db },
        { provide: VACANCY_EXTRACTOR, useValue: extractor },
      ],
    }).compile();
    return { activity: moduleRef.get(RssExtractActivity), mocks };
  }

  beforeEach(() => {
    extractor.extract.mockReset();
  });

  it("writes the extracted vacancy + _v/_usage sidecar on success", async () => {
    extractor.extract.mockResolvedValue(successResult);
    const { activity, mocks } = await bootstrap(baseRecord);

    await activity.extractAndInsert(RECORD_ID);

    expect(extractor.extract).toHaveBeenCalledTimes(1);
    const passedText = extractor.extract.mock.calls[0][0];
    expect(passedText).toContain(baseRecord.title);
    expect(passedText).toContain(baseRecord.description!);

    expect(mocks.db.update).toHaveBeenCalledWith(schema.rssRecords);
    const setArg = mocks.updateSet.mock.calls[0][0];
    expect(setArg.extractedData).toEqual({
      ...sampleExtract,
      _v: 2,
      _usage: sampleUsage,
    });
    expect(setArg.extractedAt).toBeInstanceOf(Date);
  });

  it("writes _v/_usage/_error and re-throws on failure", async () => {
    extractor.extract.mockResolvedValue(failureResult);
    const { activity, mocks } = await bootstrap(baseRecord);

    await expect(activity.extractAndInsert(RECORD_ID)).rejects.toThrow(
      "BAML extraction: boom",
    );

    // Failure-row written BEFORE the throw — Temporal retries get fresh data,
    // but the cost of this specific attempt is captured.
    expect(mocks.db.update).toHaveBeenCalledWith(schema.rssRecords);
    const setArg = mocks.updateSet.mock.calls[0][0];
    expect(setArg.extractedData).toEqual({
      _v: 2,
      _usage: failureResult.meta.usage,
      _error: "BAML extraction: boom",
    });
    expect(setArg.extractedAt).toBeInstanceOf(Date);
  });

  it("throws when the record does not exist", async () => {
    const { activity } = await bootstrap(undefined);

    await expect(activity.extractAndInsert(RECORD_ID)).rejects.toThrow(
      /Record .* not found/,
    );
    expect(extractor.extract).not.toHaveBeenCalled();
  });
});
