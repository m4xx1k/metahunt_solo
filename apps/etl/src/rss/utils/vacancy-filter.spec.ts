import { isITVacancy } from "./vacancy-filter";

describe("isITVacancy", () => {
  describe("whitelist hits", () => {
    it.each([
      "Senior Backend Developer",
      "Python Engineer",
      "DevOps / SRE",
      "Frontend (React) Developer",
      "QA Automation Engineer",
      "Розробник Java",
      "Data Engineer",
      "Embedded Firmware Engineer",
    ])("accepts %p", (title) => {
      expect(isITVacancy(title)).toBe(true);
    });
  });

  describe("blacklist hits", () => {
    it.each([
      "Senior Recruiter",
      "Marketing Manager",
      "Sales Account Manager",
      "Product Manager",
      "UI/UX Designer",
      "Mechanical Engineer",
      "HR Business Partner",
      "Customer Success Manager",
    ])("rejects %p", (title) => {
      expect(isITVacancy(title)).toBe(false);
    });
  });

  describe("unknown rejected (strict)", () => {
    it.each(["Barista", "Cleaner", "Random Job"])("rejects %p", (title) => {
      expect(isITVacancy(title)).toBe(false);
    });
  });

  it("blacklist takes precedence over whitelist", () => {
    expect(isITVacancy("Marketing Engineer")).toBe(false);
    expect(isITVacancy("Recruiter for Python team")).toBe(false);
  });
});
