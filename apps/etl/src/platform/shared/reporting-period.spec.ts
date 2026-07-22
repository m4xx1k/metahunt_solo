import { reportingPeriodSince } from "./reporting-period";

describe("reportingPeriodSince", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-22T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ["24h", "2026-07-21T12:00:00.000Z"],
    ["week", "2026-07-15T12:00:00.000Z"],
    ["30d", "2026-06-22T12:00:00.000Z"],
  ] as const)("resolves the %s reporting window", (period, expected) => {
    expect(reportingPeriodSince(period)).toEqual(new Date(expected));
  });

  it("keeps all-time reports unbounded", () => {
    expect(reportingPeriodSince("all")).toBeNull();
  });
});
