import { fitTierWeighted } from "./ranking.contract";

// Coverage is IDF-weighted: STRONG ≥ 0.8, GOOD ≥ 0.5, else STRETCH, computed
// over required-skill weight (matchedReqW / reqW). When no required skills are
// tagged, fall back to all-skill weight (matchedAllW / allW).
describe("fitTierWeighted", () => {
  it("returns STRONG when weighted required coverage is at least 80%", () => {
    expect(fitTierWeighted(8, 10, 0, 0)).toBe("STRONG");
    expect(fitTierWeighted(4, 4, 0, 0)).toBe("STRONG");
  });

  it("returns GOOD when weighted required coverage is between 50% and 80%", () => {
    expect(fitTierWeighted(5, 10, 0, 0)).toBe("GOOD");
    expect(fitTierWeighted(7, 10, 0, 0)).toBe("GOOD");
  });

  it("returns STRETCH when weighted required coverage is below 50%", () => {
    expect(fitTierWeighted(1, 10, 0, 0)).toBe("STRETCH");
  });

  it("demotes a match carried only by trivial low-IDF skills", () => {
    // required {git 0.71, english 0.71, kubernetes 2.45}; candidate has the two
    // generics, misses k8s → (0.71+0.71)/3.87 ≈ 0.37 → STRETCH (was GOOD on a
    // raw 2-of-3 count).
    expect(fitTierWeighted(1.42, 3.87, 1.42, 3.87)).toBe("STRETCH");
  });

  it("falls back to all-skill coverage when no required skills are tagged", () => {
    expect(fitTierWeighted(0, 0, 9, 10)).toBe("STRONG");
    expect(fitTierWeighted(0, 0, 6, 10)).toBe("GOOD");
    expect(fitTierWeighted(0, 0, 1, 10)).toBe("STRETCH");
  });

  it("returns STRETCH (not a free GOOD) when there is nothing to assess", () => {
    expect(fitTierWeighted(0, 0, 0, 0)).toBe("STRETCH");
  });
});
