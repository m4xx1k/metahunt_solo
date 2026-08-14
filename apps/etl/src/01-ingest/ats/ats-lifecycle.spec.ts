import { reconcileAtsBoardSnapshot } from "./ats-lifecycle";

describe("reconcileAtsBoardSnapshot", () => {
  const execute = jest.fn();
  const db = { execute } as never;

  beforeEach(() => execute.mockReset());

  it("refuses to close anything from an empty snapshot", async () => {
    await expect(reconcileAtsBoardSnapshot(db, "source-1", [])).resolves.toEqual({
      closed: 0,
      reopened: 0,
      skippedEmptySnapshot: true,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("reopens returned postings before closing only missing ones", async () => {
    execute.mockResolvedValueOnce({ rows: [{ id: "returned" }] });
    execute.mockResolvedValueOnce({ rows: [{ id: "missing-a" }, { id: "missing-b" }] });

    await expect(
      reconcileAtsBoardSnapshot(db, "source-1", ["returned", "current"]),
    ).resolves.toEqual({
      reopened: 1,
      closed: 2,
      skippedEmptySnapshot: false,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
