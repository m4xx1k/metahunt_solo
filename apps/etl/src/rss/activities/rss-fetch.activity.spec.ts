import { Test } from "@nestjs/testing";

import { DRIZZLE, schema } from "@metahunt/database";
import { StorageService } from "../../storage/storage.service";

jest.mock("@temporalio/activity", () => ({
  activityInfo: jest.fn(),
}));

jest.mock("node:fs/promises", () => ({
  readFile: jest.fn(),
}));

import { activityInfo } from "@temporalio/activity";
import { readFile } from "node:fs/promises";

import { RssFetchActivity } from "./rss-fetch.activity";

type ChainedDbMocks = {
  db: {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
  };
  selectWhere: jest.Mock;
  insertOnConflictDoNothing: jest.Mock;
  insertValues: jest.Mock;
  updateSet: jest.Mock;
  updateWhere: jest.Mock;
};

function buildDbMocks(source: unknown, ingest: unknown): ChainedDbMocks {
  const selectWhere = jest
    .fn()
    .mockResolvedValueOnce([source])
    .mockResolvedValueOnce([ingest]);
  const selectFrom = jest.fn().mockReturnValue({ where: selectWhere });
  const select = jest.fn().mockReturnValue({ from: selectFrom });

  const insertOnConflictDoNothing = jest.fn().mockResolvedValue(undefined);
  const insertValues = jest
    .fn()
    .mockReturnValue({ onConflictDoNothing: insertOnConflictDoNothing });
  const insert = jest.fn().mockReturnValue({ values: insertValues });

  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
  const update = jest.fn().mockReturnValue({ set: updateSet });

  return {
    db: { select, insert, update },
    selectWhere,
    insertOnConflictDoNothing,
    insertValues,
    updateSet,
    updateWhere,
  };
}

const SOURCE_ID = "11111111-1111-1111-1111-111111111111";
const INGEST_ID = "22222222-2222-2222-2222-222222222222";
const WORKFLOW_RUN_ID = "test-run";

const baseSource = {
  id: SOURCE_ID,
  code: "djinni",
  displayName: "Djinni",
  baseUrl: "https://djinni.co",
  rssUrl: "https://djinni.co/jobs/rss/",
  createdAt: new Date(),
};

const baseIngest = {
  id: INGEST_ID,
  sourceId: SOURCE_ID,
  workflowRunId: WORKFLOW_RUN_ID,
  triggeredBy: "temporal",
  startedAt: new Date(),
  finishedAt: null,
  payloadStorageKey: null,
  status: "running",
  errorMessage: null,
};

describe("RssFetchActivity", () => {
  const upload = jest.fn();
  let activity: RssFetchActivity;
  let mocks: ChainedDbMocks;

  async function bootstrap(source: unknown, ingest: unknown) {
    mocks = buildDbMocks(source, ingest);
    const moduleRef = await Test.createTestingModule({
      providers: [
        RssFetchActivity,
        { provide: DRIZZLE, useValue: mocks.db },
        { provide: StorageService, useValue: { upload } },
      ],
    }).compile();
    activity = moduleRef.get(RssFetchActivity);
  }

  beforeEach(() => {
    upload.mockReset().mockResolvedValue(undefined);
    (activityInfo as jest.Mock).mockReturnValue({
      workflowExecution: { runId: WORKFLOW_RUN_ID, workflowId: "wf" },
    });
    (readFile as jest.Mock).mockReset();
    (globalThis as { fetch?: unknown }).fetch = jest.fn();
  });

  it("uses fetched XML when source has rssUrl and fetch succeeds", async () => {
    await bootstrap(baseSource, baseIngest);
    const xml = "<rss>fetched</rss>";
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(xml),
    });

    const result = await activity.fetchAndStore(SOURCE_ID);

    expect(result).toBe(INGEST_ID);
    expect(globalThis.fetch).toHaveBeenCalledWith(baseSource.rssUrl);
    expect(readFile).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledWith(
      `rss/${SOURCE_ID}/${INGEST_ID}.xml`,
      Buffer.from(xml),
    );
    expect(mocks.db.insert).toHaveBeenCalledWith(schema.rssIngests);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: SOURCE_ID,
        workflowRunId: WORKFLOW_RUN_ID,
        triggeredBy: "temporal",
        status: "running",
      }),
    );
    expect(mocks.updateSet).toHaveBeenCalledWith({
      payloadStorageKey: `rss/${SOURCE_ID}/${INGEST_ID}.xml`,
    });
  });

  it("falls back to local file when fetch fails", async () => {
    await bootstrap(baseSource, baseIngest);
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue(""),
    });
    const fallbackXml = "<rss>fallback-from-file</rss>";
    (readFile as jest.Mock).mockResolvedValue(fallbackXml);

    const result = await activity.fetchAndStore(SOURCE_ID);

    expect(result).toBe(INGEST_ID);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalled();
    const [firstCallPath] = (readFile as jest.Mock).mock.calls[0];
    expect(String(firstCallPath)).toMatch(/djinni-rss\.xml$/);
    expect(upload).toHaveBeenCalledWith(
      `rss/${SOURCE_ID}/${INGEST_ID}.xml`,
      Buffer.from(fallbackXml),
    );
  });

  it("reads fallback file when source has no rssUrl", async () => {
    const offlineSource = { ...baseSource, code: "dou", rssUrl: null };
    await bootstrap(offlineSource, baseIngest);
    const fallbackXml = "<rss>dou-offline</rss>";
    (readFile as jest.Mock).mockResolvedValue(fallbackXml);

    const result = await activity.fetchAndStore(SOURCE_ID);

    expect(result).toBe(INGEST_ID);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(readFile).toHaveBeenCalled();
    const [firstCallPath] = (readFile as jest.Mock).mock.calls[0];
    expect(String(firstCallPath)).toMatch(/dou-rss\.xml$/);
    expect(upload).toHaveBeenCalledWith(
      `rss/${SOURCE_ID}/${INGEST_ID}.xml`,
      Buffer.from(fallbackXml),
    );
  });
});
