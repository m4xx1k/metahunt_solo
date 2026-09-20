const mockListStalePostings = jest.fn();
const mockExtractAndInsert = jest.fn();
const mockLoadVacancy = jest.fn();
const mockRefreshNodeStats = jest.fn();
const mockContinueAsNew = jest.fn();

jest.mock("@temporalio/workflow", () => ({
  log: { info: jest.fn(), warn: jest.fn() },
  continueAsNew: (...args: unknown[]) => mockContinueAsNew(...args),
  proxyActivities: jest
    .fn()
    .mockReturnValueOnce({ listStalePostings: mockListStalePostings })
    .mockReturnValueOnce({ extractAndInsert: mockExtractAndInsert })
    .mockReturnValueOnce({ loadVacancy: mockLoadVacancy })
    .mockReturnValueOnce({ refreshNodeStats: mockRefreshNodeStats }),
}));

import { reextractWorkflow } from "./reextract.workflow";

describe("reextractWorkflow", () => {
  beforeEach(() => {
    mockListStalePostings.mockReset();
    mockExtractAndInsert.mockReset().mockResolvedValue(undefined);
    mockLoadVacancy.mockReset().mockResolvedValue("vacancy-1");
    mockRefreshNodeStats.mockReset().mockResolvedValue(undefined);
    mockContinueAsNew.mockReset().mockResolvedValue(undefined);
  });

  it("re-extracts a batch, forces the load, and carries the count into the next run", async () => {
    mockListStalePostings.mockResolvedValue(["record-1", "record-2"]);

    await reextractWorkflow({ since: "2026-08-19" });

    expect(mockExtractAndInsert.mock.calls).toEqual([["record-1"], ["record-2"]]);
    expect(mockLoadVacancy.mock.calls).toEqual([
      ["record-1", { force: true }],
      ["record-2", { force: true }],
    ]);
    expect(mockContinueAsNew).toHaveBeenCalledWith({ since: "2026-08-19", done: 2 });
    expect(mockRefreshNodeStats).not.toHaveBeenCalled();
  });

  it("refreshes the IDF views and stops once nothing is stale", async () => {
    mockListStalePostings.mockResolvedValue([]);

    await reextractWorkflow({ done: 120 });

    expect(mockExtractAndInsert).not.toHaveBeenCalled();
    expect(mockRefreshNodeStats).toHaveBeenCalledTimes(1);
    expect(mockContinueAsNew).not.toHaveBeenCalled();
  });

  it("stops at maxPostings instead of re-reading the rest of the corpus", async () => {
    await reextractWorkflow({ maxPostings: 50, done: 50 });

    expect(mockListStalePostings).not.toHaveBeenCalled();
    expect(mockRefreshNodeStats).toHaveBeenCalledTimes(1);
    expect(mockContinueAsNew).not.toHaveBeenCalled();
  });

  it("asks for only the postings left under maxPostings", async () => {
    mockListStalePostings.mockResolvedValue(["record-1"]);

    await reextractWorkflow({ maxPostings: 42, done: 40 });

    expect(mockListStalePostings).toHaveBeenCalledWith({ since: undefined, limit: 2 });
  });

  it("keeps going when part of a batch fails, counting only what landed", async () => {
    mockListStalePostings.mockResolvedValue(["record-1", "record-2"]);
    mockExtractAndInsert.mockImplementation((id: string) =>
      id === "record-1" ? Promise.reject(new Error("provider down")) : Promise.resolve(undefined),
    );

    await reextractWorkflow({});

    expect(mockLoadVacancy.mock.calls).toEqual([["record-2", { force: true }]]);
    expect(mockContinueAsNew).toHaveBeenCalledWith({ done: 1 });
  });

  it("fails instead of looping when a whole batch fails — those rows stay selectable", async () => {
    mockListStalePostings.mockResolvedValue(["record-1", "record-2"]);
    mockExtractAndInsert.mockRejectedValue(new Error("provider down"));

    await expect(reextractWorkflow({})).rejects.toThrow("Re-extraction stalled");
    expect(mockContinueAsNew).not.toHaveBeenCalled();
  });
});
