const mockFetchAndStore = jest.fn();
const mockParseAndDedup = jest.fn();
const mockExtractAndInsert = jest.fn();
const mockFinalizeIngest = jest.fn();
const mockFinalizeIngestByWorkflowRunId = jest.fn();
const mockStartChild = jest.fn();

jest.mock("@temporalio/workflow", () => ({
  log: { warn: jest.fn() },
  ParentClosePolicy: { ABANDON: "ABANDON" },
  WorkflowIdReusePolicy: { ALLOW_DUPLICATE_FAILED_ONLY: "ALLOW_DUPLICATE_FAILED_ONLY" },
  proxyActivities: jest
    .fn()
    .mockReturnValueOnce({ fetchAndStore: mockFetchAndStore })
    .mockReturnValueOnce({ parseAndDedup: mockParseAndDedup })
    .mockReturnValueOnce({ extractAndInsert: mockExtractAndInsert })
    .mockReturnValueOnce({
      finalizeIngest: mockFinalizeIngest,
      finalizeIngestByWorkflowRunId: mockFinalizeIngestByWorkflowRunId,
    }),
  startChild: mockStartChild,
  workflowInfo: () => ({ runId: "workflow-run-1" }),
}));

import { rssIngestWorkflow } from "./rss-ingest.workflow";

describe("rssIngestWorkflow", () => {
  beforeEach(() => {
    mockFetchAndStore.mockReset();
    mockParseAndDedup.mockReset();
    mockExtractAndInsert.mockReset();
    mockFinalizeIngest.mockReset();
    mockFinalizeIngestByWorkflowRunId.mockReset();
    mockStartChild.mockReset();
  });

  it("finalizes the created ingest when fetch retries are exhausted", async () => {
    mockFetchAndStore.mockRejectedValue(new Error("storage unavailable"));
    mockFinalizeIngestByWorkflowRunId.mockResolvedValue(undefined);

    await expect(rssIngestWorkflow("source-1")).rejects.toThrow("storage unavailable");

    expect(mockFinalizeIngestByWorkflowRunId).toHaveBeenCalledWith(
      "workflow-run-1",
      "failed",
      "storage unavailable",
    );
    expect(mockFinalizeIngest).not.toHaveBeenCalled();
  });
});
