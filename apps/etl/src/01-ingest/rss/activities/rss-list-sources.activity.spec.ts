import { Test } from "@nestjs/testing";

import { DRIZZLE, schema } from "@metahunt/database";

import { RssListSourcesActivity } from "./rss-list-sources.activity";

function buildDbMock(rows: { id: string; code: string }[]) {
  const execute = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ execute });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });
  return { db: { select }, select, from, where, execute };
}

describe("RssListSourcesActivity", () => {
  async function bootstrap(rows: { id: string; code: string }[]) {
    const mocks = buildDbMock(rows);
    const moduleRef = await Test.createTestingModule({
      providers: [
        RssListSourcesActivity,
        { provide: DRIZZLE, useValue: mocks.db },
      ],
    }).compile();
    return { activity: moduleRef.get(RssListSourcesActivity), mocks };
  }

  it("returns id+code for sources that have an rssUrl", async () => {
    const rows = [
      { id: "11111111-1111-1111-1111-111111111111", code: "djinni" },
      { id: "22222222-2222-2222-2222-222222222222", code: "dou" },
    ];
    const { activity, mocks } = await bootstrap(rows);

    const sources = await activity.listRemoteSources();

    expect(sources).toEqual(rows);
    expect(mocks.select).toHaveBeenCalledWith({
      id: schema.sources.id,
      code: schema.sources.code,
    });
    expect(mocks.from).toHaveBeenCalledWith(schema.sources);
    expect(mocks.where).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array when no remote sources exist", async () => {
    const { activity } = await bootstrap([]);
    expect(await activity.listRemoteSources()).toEqual([]);
  });
});
