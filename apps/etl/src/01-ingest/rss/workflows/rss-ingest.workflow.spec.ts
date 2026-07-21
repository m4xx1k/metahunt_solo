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

  it("isolates a failed record and dispatches only successful extractions", async () => {
    mockFetchAndStore.mockResolvedValue("ingest-1");
    mockParseAndDedup.mockResolvedValue(["record-1", "record-2"]);
    mockExtractAndInsert
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("bad LLM"));
    mockStartChild.mockResolvedValue({});
    mockFinalizeIngest.mockResolvedValue(undefined);

    await expect(rssIngestWorkflow("source-1")).resolves.toBeUndefined();

    expect(mockStartChild).toHaveBeenCalledTimes(1);
    expect(mockStartChild).toHaveBeenCalledWith("vacancyPipelineWorkflow", {
      args: ["record-1"],
      workflowId: "vacancy-pipeline-record-1",
      parentClosePolicy: "ABANDON",
      workflowIdReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
    });
    expect(mockFinalizeIngest).toHaveBeenCalledWith(
      "ingest-1",
      "completed",
      "extracted=1/2 (failures=1)",
    );
    expect(mockFinalizeIngestByWorkflowRunId).not.toHaveBeenCalled();
  });
});
