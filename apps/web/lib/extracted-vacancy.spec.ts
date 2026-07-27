import { formatSalary } from "./extracted-vacancy";

describe("formatSalary", () => {
  it("renders the currency code, not a glyph", () => {
    expect(formatSalary({ min: 3000, max: 5000, currency: "USD" })).toBe("3k–5k USD");
    expect(formatSalary({ min: 2000, max: 4000, currency: "EUR" })).toBe("2k–4k EUR");
    expect(formatSalary({ min: 60000, max: null, currency: "UAH" })).toBe("60k UAH");
  });

  it("compacts thousands, keeping one decimal only when it carries information", () => {
    expect(formatSalary({ min: 1500, max: null, currency: "USD" })).toBe("1.5k USD");
    expect(formatSalary({ min: 800, max: null, currency: "USD" })).toBe("800 USD");
  });

  it("collapses a range whose bounds are equal", () => {
    expect(formatSalary({ min: 4000, max: 4000, currency: "USD" })).toBe("4k USD");
  });

  it("omits the code when the currency is unknown", () => {
    expect(formatSalary({ min: 3000, max: 5000, currency: null })).toBe("3k–5k");
  });

  it("returns null when there is no number to show", () => {
    expect(formatSalary(null)).toBeNull();
    expect(formatSalary({ min: null, max: null, currency: "USD" })).toBeNull();
  });
});
