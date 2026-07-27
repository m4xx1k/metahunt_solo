import type { VacancyUpsertValues } from "../repositories/vacancy.repository";

import { applyAtsPrecedence } from "./ats-field-precedence";

const base = (over: Partial<VacancyUpsertValues> = {}): VacancyUpsertValues => ({
  sourceId: "s",
  externalId: "e",
  lastRssRecordId: "r",
  title: "Engineer",
  ...over,
});

describe("applyAtsPrecedence", () => {
  it("labels an LLM-derived salary as such when the board stated nothing", () => {
    const result = applyAtsPrecedence(base({ salaryMin: 1000, currency: "USD" }), null);
    expect(result.salarySource).toBe("LLM_TEXT");
    expect(result.salaryMin).toBe(1000);
  });

  it("leaves salary_source null when nobody supplied a salary", () => {
    expect(applyAtsPrecedence(base(), null).salarySource).toBeNull();
  });

  // The rule the whole design exists for.
  it("lets a board-stated salary overwrite the LLM's reading", () => {
    const result = applyAtsPrecedence(base({ salaryMin: 900, salaryMax: 1100, currency: "USD" }), {
      salary: { min: 110000, max: 130000, currency: "UAH", raw: '{"from":110000}' },
    });
    expect(result).toMatchObject({
      salaryMin: 110000,
      salaryMax: 130000,
      currency: "UAH",
      salarySource: "ATS_STRUCTURED",
      salaryRaw: '{"from":110000}',
    });
  });

  it("never lets the LLM overwrite a board-stated salary", () => {
    const result = applyAtsPrecedence(base({ salaryMin: 5, salaryMax: 6, currency: "EUR" }), {
      salary: { min: 800, max: 1200, currency: "USD", raw: "{}" },
    });
    expect(result.salarySource).toBe("ATS_STRUCTURED");
    expect(result.salaryMin).toBe(800);
  });

  // Dropping the numbers would be the worse failure: keep them, null the enum,
  // and let a later widening recover the currency from salary_raw.
  it("keeps the numbers when the currency has no enum value", () => {
    const result = applyAtsPrecedence(base(), {
      salary: { min: 100, max: 200, currency: "JPY", raw: '{"currency":"JPY"}' },
    });
    expect(result.salaryMin).toBe(100);
    expect(result.currency).toBeNull();
    expect(result.salaryRaw).toContain("JPY");
  });

  it("ignores an ats salary object carrying no numbers", () => {
    const result = applyAtsPrecedence(base({ salaryMin: 1000 }), {
      salary: { min: null, max: null, currency: "USD", raw: "{}" },
    });
    expect(result.salarySource).toBe("LLM_TEXT");
    expect(result.salaryMin).toBe(1000);
  });

  it("prefers board locations and employment type", () => {
    const result = applyAtsPrecedence(
      base({ locations: [{ city: "Wrong" }], employmentType: "CONTRACT" }),
      {
        locations: ["Kyiv", "Lviv"],
        employmentType: "FULL_TIME",
      },
    );
    expect(result.locations).toEqual(["Kyiv", "Lviv"]);
    expect(result.employmentType).toBe("FULL_TIME");
  });

  it("does not override the work format on a falsy remote flag", () => {
    const office = applyAtsPrecedence(base({ workFormat: "HYBRID" }), { isRemote: false });
    const remote = applyAtsPrecedence(base({ workFormat: "HYBRID" }), { isRemote: true });
    // `false` distinguishes neither OFFICE nor HYBRID — the LLM read the text.
    expect(office.workFormat).toBe("HYBRID");
    expect(remote.workFormat).toBe("REMOTE");
  });

  it("keeps empty board locations from erasing what the LLM found", () => {
    const result = applyAtsPrecedence(base({ locations: [{ city: "Kyiv" }] }), { locations: [] });
    expect(result.locations).toEqual([{ city: "Kyiv" }]);
  });
});
