import { AtsBoardsController } from "./ats-boards.controller";

describe("AtsBoardsController", () => {
  const execute = jest.fn();
  const controller = new AtsBoardsController({ execute } as never);

  beforeEach(() => execute.mockReset());

  it("defaults to open postings and returns a stable paginated wire contract", async () => {
    execute.mockResolvedValue({
      rows: [
        {
          id: "v1",
          title: "Engineer",
          companyName: "Acme",
          companySlug: null,
          atsType: "ashby",
          boardSlug: "acme",
          link: "https://jobs.example/v1",
          locations: ["Kyiv"],
          workFormat: "REMOTE",
          seniority: null,
          salaryMin: 10_000,
          salaryMax: 12_000,
          currency: "USD",
          salaryPeriod: "YEAR",
          salarySource: "ATS_STRUCTURED",
          publishedAt: "2026-07-01",
          closedAt: null,
          status: "OPEN",
          isUa: true,
          hasDuplicate: false,
          needsReview: false,
          total: 3,
        },
      ],
    });

    await expect(
      controller.jobs(undefined, undefined, undefined, undefined, undefined, undefined, undefined),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "v1",
          status: "OPEN",
          salaryPeriod: "YEAR",
          link: "https://jobs.example/v1",
        }),
      ],
      total: 3,
      limit: 25,
      offset: 0,
    });
  });

  it("caps manually supplied pagination instead of allowing an unbounded board scan", async () => {
    execute.mockResolvedValue([]);
    const result = await controller.jobs(
      undefined,
      "all",
      undefined,
      undefined,
      undefined,
      "10000",
      "12",
    );
    expect(result).toMatchObject({ items: [], total: 0, limit: 100, offset: 12 });
  });

  it("returns an honest zero-data overview rather than throwing on a fresh POC database", async () => {
    execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await expect(controller.overview()).resolves.toMatchObject({
      totals: { boards: 0, jobs: 0, openJobs: 0, closedJobs: 0 },
      fieldCoverage: expect.arrayContaining([
        expect.objectContaining({ field: "original URL", filled: 0, total: 0 }),
      ]),
      problemBoards: [],
    });
  });
});
