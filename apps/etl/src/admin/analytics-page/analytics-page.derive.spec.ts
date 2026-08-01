import { clampedMinutesBetween } from "./analytics-page.derive";

describe("clampedMinutesBetween", () => {
  it("computes minutes between two timestamps", () => {
    const earlier = new Date("2026-08-01T00:00:00Z");
    const later = new Date("2026-08-01T00:30:00Z");

    expect(clampedMinutesBetween(earlier, later)).toBe(30);
  });

  it("accepts ISO string inputs", () => {
    expect(clampedMinutesBetween("2026-08-01T00:00:00Z", "2026-08-01T01:00:00Z")).toBe(60);
  });

  it("returns null when either side is missing", () => {
    expect(clampedMinutesBetween(null, new Date())).toBeNull();
    expect(clampedMinutesBetween(new Date(), null)).toBeNull();
    expect(clampedMinutesBetween(null, null)).toBeNull();
  });

  it("clamps a negative duration to null instead of returning a negative number", () => {
    const earlier = new Date("2026-08-01T01:00:00Z");
    const later = new Date("2026-08-01T00:00:00Z"); // before `earlier` — reassigned person id

    expect(clampedMinutesBetween(earlier, later)).toBeNull();
  });

  it("returns 0 for a zero-duration gap, not null", () => {
    const at = new Date("2026-08-01T00:00:00Z");

    expect(clampedMinutesBetween(at, at)).toBe(0);
  });
});
