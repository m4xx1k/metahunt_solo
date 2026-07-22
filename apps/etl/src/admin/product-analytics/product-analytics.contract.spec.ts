import { validate } from "class-validator";

import {
  MAX_ANALYTICS_COHORT_ID_LENGTH,
  UpdateAnalyticsJourneyDto,
} from "./product-analytics.contract";

describe("UpdateAnalyticsJourneyDto", () => {
  it("accepts a bounded optional cohort id", async () => {
    const dto = Object.assign(new UpdateAnalyticsJourneyDto(), {
      isTest: true,
      cohortId: "c".repeat(MAX_ANALYTICS_COHORT_ID_LENGTH),
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("rejects an oversized cohort id", async () => {
    const dto = Object.assign(new UpdateAnalyticsJourneyDto(), {
      isTest: true,
      cohortId: "c".repeat(MAX_ANALYTICS_COHORT_ID_LENGTH + 1),
    });

    await expect(validate(dto)).resolves.toHaveLength(1);
  });

  it("requires an explicit boolean classification", async () => {
    const dto = Object.assign(new UpdateAnalyticsJourneyDto(), { isTest: "true" });

    await expect(validate(dto)).resolves.toHaveLength(1);
  });
});
