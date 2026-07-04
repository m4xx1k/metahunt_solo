import {
  formatCount,
  formatDateOnly,
  formatDateRange,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRelative,
  formatSalaryRange,
  formatTokens,
  formatUsd,
  pluralizeUa,
} from "@/lib/format";

describe("formatDateTime", () => {
  it("renders an em dash for nullish/empty input", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("")).toBe("—");
  });

  it("renders an em dash for an unparseable date", () => {
    expect(formatDateTime("not-a-date")).toBe("—");
  });

  it("renders ISO as 'YYYY-MM-DD HH:MM:SS UTC'", () => {
    expect(formatDateTime("2026-05-30T12:34:56.789Z")).toBe(
      "2026-05-30 12:34:56 UTC",
    );
  });
});

describe("formatRelative", () => {
  const NOW = new Date("2026-05-30T12:00:00.000Z").getTime();
  let nowSpy: jest.SpyInstance;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW);
  });
  afterEach(() => nowSpy.mockRestore());

  const ago = (ms: number) => new Date(NOW - ms).toISOString();
  const ahead = (ms: number) => new Date(NOW + ms).toISOString();

  it("returns an em dash for nullish input", () => {
    expect(formatRelative(null)).toBe("—");
  });

  it("buckets sub-minute, minutes, hours and days in the past", () => {
    expect(formatRelative(ago(10 * 1000))).toBe("10s ago");
    expect(formatRelative(ago(5 * 60 * 1000))).toBe("5m ago");
    expect(formatRelative(ago(3 * 60 * 60 * 1000))).toBe("3h ago");
    expect(formatRelative(ago(2 * 24 * 60 * 60 * 1000))).toBe("2d ago");
  });

  it("flips the suffix for future timestamps", () => {
    expect(formatRelative(ahead(5 * 60 * 1000))).toBe("5m from now");
  });

  it("falls back to absolute datetime past 30 days", () => {
    expect(formatRelative(ago(40 * 24 * 60 * 60 * 1000))).toMatch(/UTC$/);
  });
});

describe("formatDuration", () => {
  it("returns an em dash for nullish input", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
  });

  it("renders sub-second as milliseconds", () => {
    expect(formatDuration(500)).toBe("500ms");
  });

  it("renders sub-minute as fixed seconds", () => {
    expect(formatDuration(1500)).toBe("1.5s");
  });

  it("renders minute+ as 'Xm Ys'", () => {
    expect(formatDuration(65_000)).toBe("1m 5s");
  });
});

describe("formatCount", () => {
  it("groups thousands with commas", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1_234_567)).toBe("1,234,567");
  });
});

describe("formatPercent", () => {
  it("returns 0% when the denominator is non-positive", () => {
    expect(formatPercent(5, 0)).toBe("0%");
    expect(formatPercent(5, -1)).toBe("0%");
  });

  it("rounds the ratio to a whole percent", () => {
    expect(formatPercent(1, 4)).toBe("25%");
    expect(formatPercent(2, 3)).toBe("67%");
  });
});

describe("formatUsd", () => {
  it("returns an em dash for nullish input", () => {
    expect(formatUsd(null)).toBe("—");
  });

  it("renders zero without decimals", () => {
    expect(formatUsd(0)).toBe("$0");
  });

  it("widens precision for tiny amounts", () => {
    expect(formatUsd(0.005)).toBe("$0.0050");
    expect(formatUsd(0.5)).toBe("$0.500");
  });

  it("renders regular amounts with two decimals", () => {
    expect(formatUsd(12.3)).toBe("$12.30");
  });
});

describe("formatTokens", () => {
  it("returns an em dash for nullish input", () => {
    expect(formatTokens(null)).toBe("—");
  });

  it("renders sub-thousand verbatim", () => {
    expect(formatTokens(999)).toBe("999");
  });

  it("renders thousands with a 'k' suffix", () => {
    expect(formatTokens(1500)).toBe("1.5k");
  });

  it("renders millions with an 'M' suffix", () => {
    expect(formatTokens(2_500_000)).toBe("2.50M");
  });
});

describe("formatDateOnly", () => {
  it("keeps only the calendar date", () => {
    expect(formatDateOnly("2026-05-30T12:34:56.000Z")).toBe("2026-05-30");
  });
});

describe("formatDateRange", () => {
  it("collapses to one date when both ends are the same day", () => {
    expect(
      formatDateRange("2026-05-30T01:00:00Z", "2026-05-30T20:00:00Z"),
    ).toBe("2026-05-30");
  });

  it("shows an arrow range across different days", () => {
    expect(
      formatDateRange("2026-05-01T00:00:00Z", "2026-05-30T00:00:00Z"),
    ).toBe("2026-05-01 → 2026-05-30");
  });
});

describe("formatSalaryRange", () => {
  it("renders both bounds", () => {
    expect(formatSalaryRange({ min: 100, max: 200, currency: "USD" })).toBe(
      "100-200 USD",
    );
  });

  it("renders a single open bound with a prefix", () => {
    expect(formatSalaryRange({ min: 100, max: null, currency: "USD" })).toBe(
      "from 100 USD",
    );
    expect(formatSalaryRange({ min: null, max: 200, currency: "USD" })).toBe(
      "up to 200 USD",
    );
  });

  it("trims the trailing space when currency is missing", () => {
    expect(formatSalaryRange({ min: 100, max: 200, currency: null })).toBe(
      "100-200",
    );
  });

  it("renders an em dash when both bounds are absent", () => {
    expect(formatSalaryRange({ min: null, max: null, currency: "USD" })).toBe(
      "—",
    );
  });
});

describe("pluralizeUa", () => {
  const p = (n: number) => pluralizeUa(n, "оголошення", "оголошення", "оголошень");

  it("selects the 'one' form for n ending in 1 (except 11)", () => {
    expect(pluralizeUa(1, "one", "few", "many")).toBe("one");
    expect(pluralizeUa(21, "one", "few", "many")).toBe("one");
    expect(pluralizeUa(11, "one", "few", "many")).toBe("many");
  });

  it("selects the 'few' form for n ending in 2-4 (except teens)", () => {
    expect(pluralizeUa(2, "one", "few", "many")).toBe("few");
    expect(pluralizeUa(24, "one", "few", "many")).toBe("few");
    expect(pluralizeUa(12, "one", "few", "many")).toBe("many");
  });

  it("selects the 'many' form otherwise", () => {
    expect(p(5)).toBe("оголошень");
    expect(p(100)).toBe("оголошень");
  });
});
