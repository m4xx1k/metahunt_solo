import { fitTier } from "./ranking.contract";

describe("fitTier", () => {
  it("returns STRONG when coverage is at least 80%", () => {
    expect(fitTier(8, 10)).toBe("STRONG");
    expect(fitTier(4, 4)).toBe("STRONG");
  });

  it("returns GOOD when coverage is between 50% and 80%", () => {
    expect(fitTier(5, 10)).toBe("GOOD");
    expect(fitTier(7, 10)).toBe("GOOD");
  });

  it("returns STRETCH when coverage is below 50%", () => {
    expect(fitTier(1, 10)).toBe("STRETCH");
    expect(fitTier(0, 3)).toBe("STRETCH");
  });

  it("returns GOOD when the vacancy has no required skills", () => {
    expect(fitTier(0, 0)).toBe("GOOD");
  });
});
