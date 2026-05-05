import { Test } from "@nestjs/testing";

import { VacancyLoaderService } from "../services/vacancy-loader.service";

import { LoadVacancyActivity } from "./load-vacancy.activity";

const RECORD_ID = "33333333-3333-3333-3333-333333333333";
const VACANCY_ID = "vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv";

describe("LoadVacancyActivity", () => {
  async function bootstrap() {
    const loadFromRecord = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        LoadVacancyActivity,
        { provide: VacancyLoaderService, useValue: { loadFromRecord } },
      ],
    }).compile();
    return {
      activity: moduleRef.get(LoadVacancyActivity),
      loadFromRecord,
    };
  }

  it("delegates to VacancyLoaderService and returns the vacancy id", async () => {
    const { activity, loadFromRecord } = await bootstrap();
    loadFromRecord.mockResolvedValue(VACANCY_ID);

    const result = await activity.loadVacancy(RECORD_ID);

    expect(loadFromRecord).toHaveBeenCalledWith(RECORD_ID);
    expect(result).toBe(VACANCY_ID);
  });

  it("propagates loader errors so Temporal can retry", async () => {
    const { activity, loadFromRecord } = await bootstrap();
    loadFromRecord.mockRejectedValue(new Error("db down"));

    await expect(activity.loadVacancy(RECORD_ID)).rejects.toThrow("db down");
  });
});
