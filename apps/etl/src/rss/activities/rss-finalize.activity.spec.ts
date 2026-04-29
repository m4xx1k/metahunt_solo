import { Test } from "@nestjs/testing";

import { DRIZZLE, schema } from "@metahunt/database";

import { RssFinalizeActivity } from "./rss-finalize.activity";

const INGEST_ID = "22222222-2222-2222-2222-222222222222";

function buildDbMocks() {
  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
  const update = jest.fn().mockReturnValue({ set: updateSet });
  return { db: { update }, updateSet, updateWhere };
}

describe("RssFinalizeActivity", () => {
  async function bootstrap() {
    const mocks = buildDbMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RssFinalizeActivity,
        { provide: DRIZZLE, useValue: mocks.db },
      ],
    }).compile();
    return { activity: moduleRef.get(RssFinalizeActivity), mocks };
  }

  it("marks ingest completed without errorMessage", async () => {
    const { activity, mocks } = await bootstrap();

    await activity.finalizeIngest(INGEST_ID, "completed");

    expect(mocks.db.update).toHaveBeenCalledWith(schema.rssIngests);
    const setArg = mocks.updateSet.mock.calls[0][0];
    expect(setArg.status).toBe("completed");
    expect(setArg.finishedAt).toBeInstanceOf(Date);
    expect(setArg).not.toHaveProperty("errorMessage");
  });

  it("marks ingest failed with errorMessage", async () => {
    const { activity, mocks } = await bootstrap();

    await activity.finalizeIngest(INGEST_ID, "failed", "boom");

    const setArg = mocks.updateSet.mock.calls[0][0];
    expect(setArg.status).toBe("failed");
    expect(setArg.errorMessage).toBe("boom");
    expect(setArg.finishedAt).toBeInstanceOf(Date);
  });
});
