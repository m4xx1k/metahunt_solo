import { buildScoreBreakdown, fitPercent } from "./score.contract";

// The breakdown is the wire shape the Fit % tooltip renders from, so the
// invariant that matters is `total === Σ contribution` — it must hold no matter
// how many signals exist later.
describe("buildScoreBreakdown", () => {
  it("carries exactly one skill-overlap signal today", () => {
    const breakdown = buildScoreBreakdown(0.75);

    expect(breakdown.signals).toEqual([
      { kind: "skill-overlap", raw: 0.75, weight: 1, contribution: 0.75 },
    ]);
  });

  it("keeps total equal to the summed contributions", () => {
    const breakdown = buildScoreBreakdown(0.42);

    expect(breakdown.total).toBeCloseTo(
      breakdown.signals.reduce((sum, s) => sum + s.contribution, 0),
    );
  });

  it("clamps a coverage outside [0,1] instead of showing an impossible fit", () => {
    expect(buildScoreBreakdown(1.4).total).toBe(1);
    expect(buildScoreBreakdown(-0.2).total).toBe(0);
  });
});

describe("fitPercent", () => {
  it("renders a whole percentage", () => {
    expect(fitPercent(0.873)).toBe(87);
    expect(fitPercent(0)).toBe(0);
    expect(fitPercent(1)).toBe(100);
  });
});
