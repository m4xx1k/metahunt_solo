import { formatAtsLocations, formatAtsSalary } from "./ats-format";

describe("ATS presentation", () => {
  it("restores an annual ATS salary before labelling it annual", () => {
    expect(
      formatAtsSalary({
        salaryMin: 10_000,
        salaryMax: 20_000,
        currency: "USD",
        salaryPeriod: "YEAR",
      }),
    ).toBe("120K–240K USD / year");
  });

  it("keeps a monthly figure monthly and does not invent a period when absent", () => {
    expect(
      formatAtsSalary({
        salaryMin: 4_000,
        salaryMax: null,
        currency: "EUR",
        salaryPeriod: "MONTH",
      }),
    ).toBe("4K EUR / month");
    expect(
      formatAtsSalary({ salaryMin: 4_000, salaryMax: null, currency: "EUR", salaryPeriod: null }),
    ).toBe("4K EUR");
  });

  it("keeps string locations and caps the display without discarding them", () => {
    expect(formatAtsLocations(["Kyiv, Ukraine", "Lviv, Ukraine", "Remote"])).toBe(
      "Kyiv, Ukraine · Lviv, Ukraine +1",
    );
  });
});
