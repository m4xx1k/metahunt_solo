const mockListRemoteSources = jest.fn();
const mockRefreshNodeStats = jest.fn();
const mockStartChild = jest.fn();
const mockWarn = jest.fn();

jest.mock("@temporalio/workflow", () => ({
  log: { warn: mockWarn },
  ParentClosePolicy: { ABANDON: "ABANDON" },
  proxyActivities: jest
    .fn()
    .mockReturnValueOnce({ listRemoteSources: mockListRemoteSources })
    .mockReturnValueOnce({ refreshNodeStats: mockRefreshNodeStats }),
  startChild: mockStartChild,
  workflowInfo: () => ({ startTime: new Date("2026-07-21T12:34:56.789Z") }),
}));

import { rssIngestAllWorkflow } from "./rss-ingest-all.workflow";

describe("rssIngestAllWorkflow", () => {
  beforeEach(() => {
    mockListRemoteSources.mockReset();
    mockRefreshNodeStats.mockReset().mockResolvedValue(undefined);
    mockStartChild.mockReset().mockResolvedValue({});
    mockWarn.mockReset();
  });

  it("does nothing when there are no remote sources", async () => {
    mockListRemoteSources.mockResolvedValue([]);

    await expect(rssIngestAllWorkflow()).resolves.toEqual({ started: 0 });

    expect(mockStartChild).not.toHaveBeenCalled();
    expect(mockRefreshNodeStats).not.toHaveBeenCalled();
  });

  it("starts each source with a deterministic workflow id", async () => {
    mockListRemoteSources.mockResolvedValue([
      { id: "source-1", code: "dou" },
      { id: "source-2", code: "djinni" },
    ]);

    await expect(rssIngestAllWorkflow()).resolves.toEqual({ started: 2 });

    expect(mockStartChild).toHaveBeenNthCalledWith(1, "rssIngestWorkflow", {
      args: ["source-1"],
      workflowId: "rss-ingest-dou-2026-07-21T12-34-56Z",
      parentClosePolicy: "ABANDON",
    });
    expect(mockStartChild).toHaveBeenNthCalledWith(2, "rssIngestWorkflow", {
      args: ["source-2"],
      workflowId: "rss-ingest-djinni-2026-07-21T12-34-56Z",
      parentClosePolicy: "ABANDON",
    });
    expect(mockRefreshNodeStats).toHaveBeenCalledTimes(1);
  });

  it("isolates a failed source start and reports the successful count", async () => {
    mockListRemoteSources.mockResolvedValue([
      { id: "source-1", code: "dou" },
      { id: "source-2", code: "djinni" },
    ]);
    mockStartChild.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("start unavailable"));

    await expect(rssIngestAllWorkflow()).resolves.toEqual({ started: 1 });

    expect(mockStartChild).toHaveBeenCalledTimes(2);
    expect(mockWarn).toHaveBeenCalledWith("Failed to start 1/2 source ingest workflow(s).", {
      firstError: "Error: start unavailable",
    });
    expect(mockRefreshNodeStats).toHaveBeenCalledTimes(1);
  });
});
