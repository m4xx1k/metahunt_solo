import {
  COMPANY_HUB_MIN_VACANCIES,
  ROLE_HUB_MIN_VACANCIES,
  companyHubDescription,
  companyHubTitle,
  roleHubDescription,
  roleHubTitle,
  vacancyCountPhrase,
} from "./hub-meta";

const SERP_TITLE_MAX = 60;
const BRAND_SUFFIX = " · metahunt";

const ROLES = [
  "Backend Developer",
  "Full Stack Developer",
  "DevOps Engineer",
  "QA Engineer",
  "Embedded Software Engineer",
  "Data Analyst",
  "CTO / Chief Technology Officer",
];
const COMPANIES = ["N-iX", "Ajax Systems", "Sigma Software", "ЛУН", "OTP Bank Україна"];

describe("thresholds", () => {
  it("requires real supply before a programmatic page exists", () => {
    // Thin/doorway pages are a penalty risk, so the floor is a number in code
    // rather than a judgement call at review time.
    expect(ROLE_HUB_MIN_VACANCIES).toBeGreaterThanOrEqual(3);
    expect(COMPANY_HUB_MIN_VACANCIES).toBeGreaterThanOrEqual(3);
  });
});

describe("vacancyCountPhrase", () => {
  it("agrees the noun with the count", () => {
    expect(vacancyCountPhrase(1)).toBe("1 вакансія");
    expect(vacancyCountPhrase(3)).toBe("3 вакансії");
    expect(vacancyCountPhrase(11)).toBe("11 вакансій");
    expect(vacancyCountPhrase(855)).toBe("855 вакансій");
  });

  it("groups thousands the Ukrainian way", () => {
    expect(vacancyCountPhrase(2463)).toMatch(/^2\s463 вакансії$/);
  });
});

describe("role hub copy", () => {
  it("fits the SERP title budget for every role we serve", () => {
    for (const role of ROLES) {
      expect(`${roleHubTitle(role)}${BRAND_SUFFIX}`.length).toBeLessThanOrEqual(SERP_TITLE_MAX);
    }
  });

  it("is unique per role", () => {
    expect(new Set(ROLES.map(roleHubTitle)).size).toBe(ROLES.length);
    expect(new Set(ROLES.map((r) => roleHubDescription(r, 10))).size).toBe(ROLES.length);
  });

  it("keeps descriptions inside the snippet budget", () => {
    for (const role of ROLES) {
      const d = roleHubDescription(role, 2463);
      expect(d.length).toBeGreaterThanOrEqual(110);
      expect(d.length).toBeLessThanOrEqual(165);
    }
  });

  it("does not collide with the track pages' phrasing", () => {
    // /backend is a track, /role/backend-developer is a role — different pages,
    // so they must not compete on the same title.
    expect(roleHubTitle("Backend Developer")).not.toBe("Вакансії Backend в Україні");
  });
});

describe("company hub copy", () => {
  it("fits the SERP title budget", () => {
    for (const company of COMPANIES) {
      expect(`${companyHubTitle(company)}${BRAND_SUFFIX}`.length).toBeLessThanOrEqual(
        SERP_TITLE_MAX,
      );
    }
  });

  it("is unique per company", () => {
    expect(new Set(COMPANIES.map(companyHubTitle)).size).toBe(COMPANIES.length);
  });

  it("keeps descriptions inside the snippet budget", () => {
    for (const company of COMPANIES) {
      const d = companyHubDescription(company, 61);
      expect(d.length).toBeLessThanOrEqual(165);
    }
  });

  it("handles a Cyrillic company name", () => {
    expect(companyHubTitle("ЛУН")).toBe("Вакансії в ЛУН");
  });
});

describe("long company names", () => {
  // Real values from the data: names run to 90 characters.
  const LONG = [
    "414 окрема бригада безпілотних систем «Птахи Мадяра»",
    "DAI Global, LLC - U.S. Cybersecurity for Critical Infrastructure Activity",
    "81 окрема аеромобільна Слобожанська бригада 7-го Корпусу Швидкого Реагування",
    "AI Center of Excellence при Міністерстві цифрової трансформації",
  ];

  it("keeps the title inside the SERP budget", () => {
    for (const name of LONG) {
      expect(`${companyHubTitle(name)}${BRAND_SUFFIX}`.length).toBeLessThanOrEqual(SERP_TITLE_MAX);
    }
  });

  it("keeps the description inside the snippet budget", () => {
    for (const name of LONG) {
      expect(companyHubDescription(name, 7).length).toBeLessThanOrEqual(165);
    }
  });

  it("marks a clipped name with an ellipsis rather than cutting silently", () => {
    expect(companyHubTitle(LONG[0])).toMatch(/…$/);
  });

  it("does not clip a name that already fits", () => {
    expect(companyHubTitle("N-iX")).toBe("Вакансії в N-iX");
    expect(companyHubTitle("N-iX")).not.toMatch(/…/);
  });

  // Deliberately NOT asserting that two long names stay distinct. A hard
  // character budget and guaranteed uniqueness are in tension, and the budget
  // wins: a title truncated by Google is worse than two similar titles on two
  // low-traffic pages. Names sharing their first 38 characters will collide.
});
