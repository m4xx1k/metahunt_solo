import { markLeverage, recCoveragePct } from "./recommendation.derive";

const item = (name: string, idf: number) => ({
  nodeId: name,
  name,
  unlocks: 1,
  toStrong: 0,
  idf,
});

describe("recCoveragePct", () => {
  it("rounds the covered share to a whole percent", () => {
    expect(recCoveragePct(58, 100)).toBe(58);
    expect(recCoveragePct(1, 3)).toBe(33);
  });

  it("returns 0 for an empty cohort", () => {
    expect(recCoveragePct(0, 0)).toBe(0);
  });
});

describe("markLeverage", () => {
  it("flags skills at or above the mean IDF as leverage", () => {
    const [a, b, c] = markLeverage([item("a", 1), item("b", 2), item("c", 3)]);

    expect(a.leverage).toBe(false);
    expect(b.leverage).toBe(true);
    expect(c.leverage).toBe(true);
  });

  it("returns an empty list unchanged", () => {
    expect(markLeverage([])).toEqual([]);
  });
});
