import { VACANCY_TITLE_BUDGET, vacancyTitle } from "./vacancy-meta";

const BRAND_SUFFIX = " · metahunt";
const SERP_MAX = 60;

const rendered = (t: string) => `${t}${BRAND_SUFFIX}`;

describe("vacancyTitle", () => {
  it("uses seniority + role + qualifier when they fit", () => {
    expect(
      vacancyTitle({ role: "Backend Developer", seniority: "middle", qualifier: "Firetics" }),
    ).toBe("Middle Backend Developer — Firetics");
  });

  it("capitalizes the seniority label, which is stored lowercase for the badge", () => {
    expect(vacancyTitle({ role: "Backend Developer", seniority: "senior" })).toBe(
      "Senior Backend Developer",
    );
    expect(vacancyTitle({ role: "Architect", seniority: "c-level" })).toBe("C-level Architect");
  });

  it("falls back to the role alone when nothing else is known", () => {
    expect(vacancyTitle({ role: "Data Analyst" })).toBe("Data Analyst");
    expect(vacancyTitle({ role: "Data Analyst", seniority: null, qualifier: null })).toBe(
      "Data Analyst",
    );
  });

  it("adds a qualifier so identical roles do not share one title", () => {
    // 2,463 vacancies have the role "Backend Developer"; role alone is not a title.
    const a = vacancyTitle({ role: "Backend Developer", qualifier: "Firetics" });
    const b = vacancyTitle({ role: "Backend Developer", qualifier: "Kyiv, Ukraine" });
    expect(a).not.toBe(b);
  });

  it("drops the qualifier rather than overrunning the SERP budget", () => {
    const title = vacancyTitle({
      role: "Embedded Software Engineer",
      seniority: "senior",
      qualifier: "Some Very Long Company Name GmbH",
    });
    expect(rendered(title).length).toBeLessThanOrEqual(SERP_MAX);
  });

  it("keeps every realistic combination inside the budget", () => {
    const roles = [
      "Backend Developer",
      "Embedded Software Engineer",
      "Principal Software Engineer and Architect",
      "Middle/Senior Magento 2 Backend Developer",
    ];
    const seniorities = [null, "middle", "principal", "c-level"];
    const qualifiers = [null, "Firetics", "Ivano-Frankivsk, Ukraine", "Djinni"];
    for (const role of roles) {
      for (const seniority of seniorities) {
        for (const qualifier of qualifiers) {
          const title = vacancyTitle({ role, seniority, qualifier });
          expect(rendered(title).length).toBeLessThanOrEqual(SERP_MAX);
          expect(title.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("does not end mid-word or on dangling punctuation", () => {
    const title = vacancyTitle({
      role: "Principal Software Engineer and Architect",
      seniority: "principal",
      qualifier: "Firetics",
    });
    expect(title).not.toMatch(/[\s—-]$/);
    expect(title.length).toBeLessThanOrEqual(VACANCY_TITLE_BUDGET);
  });
});
