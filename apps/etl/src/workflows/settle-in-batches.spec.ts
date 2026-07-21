import { settleInBatches } from "./settle-in-batches";

describe("settleInBatches", () => {
  it("bounds concurrency and retains input order", async () => {
    let inFlight = 0;
    let maximumInFlight = 0;

    const results = await settleInBatches([1, 2, 3, 4, 5], 2, async (item) => {
      inFlight += 1;
      maximumInFlight = Math.max(maximumInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return item * 10;
    });

    expect(maximumInFlight).toBe(2);
    expect(results).toEqual([
      { status: "fulfilled", value: 10 },
      { status: "fulfilled", value: 20 },
      { status: "fulfilled", value: 30 },
      { status: "fulfilled", value: 40 },
      { status: "fulfilled", value: 50 },
    ]);
  });

  it("keeps processing later batches after a rejection", async () => {
    const results = await settleInBatches([1, 2, 3], 2, async (item) => {
      if (item === 2) throw new Error("bad item");
      return item;
    });

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });

  it("rejects an invalid batch size", async () => {
    await expect(settleInBatches([1], 0, async (item) => item)).rejects.toThrow(RangeError);
  });
});
