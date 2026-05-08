import { Test } from "@nestjs/testing";

import { DRIZZLE, schema } from "@metahunt/database";
import { StorageService } from "../../storage/storage.service";
import { RssParserService } from "../rss-parser.service";

import { RssParseActivity } from "./rss-parse.activity";

const SOURCE_ID = "11111111-1111-1111-1111-111111111111";
const INGEST_ID = "22222222-2222-2222-2222-222222222222";
const STORAGE_KEY = `rss/${SOURCE_ID}/${INGEST_ID}.xml`;

const baseIngest = {
  id: INGEST_ID,
  sourceId: SOURCE_ID,
  workflowRunId: "test-run",
  triggeredBy: "temporal",
  startedAt: new Date(),
  finishedAt: null,
  payloadStorageKey: STORAGE_KEY,
  status: "running",
  errorMessage: null,
};

const itemFixtures = [
  {
    title: "Senior Backend Engineer",
    description: "Backend role with Node.js",
    link: "https://djinni.co/jobs/100001-senior-backend/",
    pubDate: "Mon, 27 Apr 2026 09:00:00 +0000",
    guid: "https://djinni.co/jobs/100001-senior-backend/",
    category: ["Backend", "Node.js"],
  },
  {
    title: "Frontend Developer",
    description: "React + TypeScript",
    link: "https://djinni.co/jobs/100002-frontend-dev/",
    pubDate: "Mon, 27 Apr 2026 10:00:00 +0000",
    guid: "https://djinni.co/jobs/100002-frontend-dev/",
    category: "Frontend",
  },
  {
    title: "Python Developer",
    description: "Django backend",
    link: "https://djinni.co/jobs/100003-python-dev/",
    pubDate: "Mon, 27 Apr 2026 11:00:00 +0000",
    guid: "https://djinni.co/jobs/100003-python-dev/",
  },
  {
    title: "Senior Recruiter", // blacklisted — must be filtered out
    description: "HR role",
    link: "https://djinni.co/jobs/100004-recruiter/",
    pubDate: "Mon, 27 Apr 2026 12:00:00 +0000",
    guid: "https://djinni.co/jobs/100004-recruiter/",
  },
];

function buildXml(items: typeof itemFixtures): string {
  const itemTags = items
    .map((it) => {
      const cats = Array.isArray(it.category)
        ? it.category.map((c) => `<category>${c}</category>`).join("")
        : it.category
          ? `<category>${it.category}</category>`
          : "";
      return [
        "<item>",
        `<title>${it.title}</title>`,
        `<description>${it.description ?? ""}</description>`,
        `<link>${it.link ?? ""}</link>`,
        `<pubDate>${it.pubDate}</pubDate>`,
        it.guid !== undefined ? `<guid>${it.guid}</guid>` : "",
        cats,
        "</item>",
      ].join("");
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss><channel>${itemTags}</channel></rss>`;
}

type ChainedDbMocks = {
  db: {
    select: jest.Mock;
    insert: jest.Mock;
  };
  selectWhere: jest.Mock;
  insertValues: jest.Mock;
  insertOnConflictDoNothing: jest.Mock;
  insertReturning: jest.Mock;
};

function buildDbMocks(
  ingest: unknown,
  sourceCode: string,
  existingHashes: { hash: string }[],
  insertedIds: { id: string }[],
): ChainedDbMocks {
  const selectWhere = jest
    .fn()
    .mockResolvedValueOnce([ingest])
    .mockResolvedValueOnce([{ code: sourceCode }])
    .mockResolvedValueOnce(existingHashes);
  const selectFrom = jest.fn().mockReturnValue({ where: selectWhere });
  const select = jest.fn().mockReturnValue({ from: selectFrom });

  const insertReturning = jest.fn().mockResolvedValue(insertedIds);
  const insertOnConflictDoNothing = jest
    .fn()
    .mockReturnValue({ returning: insertReturning });
  const insertValues = jest
    .fn()
    .mockReturnValue({ onConflictDoNothing: insertOnConflictDoNothing });
  const insert = jest.fn().mockReturnValue({ values: insertValues });

  return {
    db: { select, insert },
    selectWhere,
    insertValues,
    insertOnConflictDoNothing,
    insertReturning,
  };
}

describe("RssParseActivity", () => {
  const download = jest.fn();
  const parser = new RssParserService();
  let activity: RssParseActivity;

  async function bootstrap(mocks: ChainedDbMocks) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RssParseActivity,
        { provide: DRIZZLE, useValue: mocks.db },
        { provide: StorageService, useValue: { download } },
        { provide: RssParserService, useValue: parser },
      ],
    }).compile();
    activity = moduleRef.get(RssParseActivity);
  }

  beforeEach(() => {
    download.mockReset();
  });

  it("inserts every IT item when none exist", async () => {
    const xml = buildXml(itemFixtures);
    download.mockResolvedValue(Buffer.from(xml, "utf8"));

    const itItems = parser.filterItItems(parser.parseXml(xml));
    expect(itItems).toHaveLength(3);

    const expectedIds = [
      { id: "rec-1" },
      { id: "rec-2" },
      { id: "rec-3" },
    ];
    const mocks = buildDbMocks(baseIngest, "djinni", [], expectedIds);
    await bootstrap(mocks);

    const result = await activity.parseAndDedup(INGEST_ID);

    expect(result).toEqual(["rec-1", "rec-2", "rec-3"]);
    expect(download).toHaveBeenCalledWith(STORAGE_KEY);
    expect(mocks.db.insert).toHaveBeenCalledWith(schema.rssRecords);

    const valuesArg = mocks.insertValues.mock.calls[0][0] as Array<{
      sourceId: string;
      rssIngestId: string;
      hash: string;
      title: string;
      externalId: string;
    }>;
    expect(valuesArg).toHaveLength(3);
    expect(valuesArg.map((v) => v.title)).toEqual([
      "Senior Backend Engineer",
      "Frontend Developer",
      "Python Developer",
    ]);
    expect(valuesArg.every((v) => v.sourceId === SOURCE_ID)).toBe(true);
    expect(valuesArg.every((v) => v.rssIngestId === INGEST_ID)).toBe(true);
    expect(valuesArg[0].hash).toBe(parser.computeHash(itItems[0]));
    expect(valuesArg.map((v) => v.externalId)).toEqual([
      "100001",
      "100002",
      "100003",
    ]);
  });

  it("skips items whose hash already exists", async () => {
    const xml = buildXml(itemFixtures);
    download.mockResolvedValue(Buffer.from(xml, "utf8"));

    const itItems = parser.filterItItems(parser.parseXml(xml));
    const existingHash = parser.computeHash(itItems[0]);

    const expectedIds = [{ id: "rec-2" }, { id: "rec-3" }];
    const mocks = buildDbMocks(
      baseIngest,
      "djinni",
      [{ hash: existingHash }],
      expectedIds,
    );
    await bootstrap(mocks);

    const result = await activity.parseAndDedup(INGEST_ID);

    expect(result).toEqual(["rec-2", "rec-3"]);
    const valuesArg = mocks.insertValues.mock.calls[0][0] as Array<{
      title: string;
      hash: string;
    }>;
    expect(valuesArg).toHaveLength(2);
    expect(valuesArg.map((v) => v.title)).toEqual([
      "Frontend Developer",
      "Python Developer",
    ]);
    expect(valuesArg.find((v) => v.hash === existingHash)).toBeUndefined();
  });

  it("skips items whose external_id cannot be derived", async () => {
    const goodAndBad = [
      itemFixtures[0],
      {
        title: "Backend Developer",
        description: "Go role",
        link: "https://djinni.co/companies/acme/", // no /jobs/<id>
        pubDate: "Mon, 27 Apr 2026 13:00:00 +0000",
        guid: "https://djinni.co/companies/acme/",
      },
      itemFixtures[2],
    ];
    const xml = buildXml(goodAndBad);
    download.mockResolvedValue(Buffer.from(xml, "utf8"));

    const expectedIds = [{ id: "rec-1" }, { id: "rec-3" }];
    const mocks = buildDbMocks(baseIngest, "djinni", [], expectedIds);
    await bootstrap(mocks);

    const result = await activity.parseAndDedup(INGEST_ID);

    expect(result).toEqual(["rec-1", "rec-3"]);
    const valuesArg = mocks.insertValues.mock.calls[0][0] as Array<{
      title: string;
      externalId: string;
    }>;
    expect(valuesArg).toHaveLength(2);
    expect(valuesArg.map((v) => v.title)).toEqual([
      "Senior Backend Engineer",
      "Python Developer",
    ]);
    expect(valuesArg.map((v) => v.externalId)).toEqual(["100001", "100003"]);
  });
});
