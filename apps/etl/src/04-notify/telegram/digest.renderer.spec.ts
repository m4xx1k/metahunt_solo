import type { VacancyDto } from "../../03-discovery/feed/feed.contract";

import { paginateDigest, renderDigest } from "./digest.renderer";

const BASE = "https://api.metahunt.io";
const WEB = "https://www.metahunt.app";
const PUBLISHED_AT = "2026-08-01T10:30:00.000Z";

function createVacancy(overrides: Partial<VacancyDto> = {}): VacancyDto {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    externalId: "ext-1",
    rssRecordId: "rss-1",
    source: { id: "s1", code: "djinni", displayName: "Djinni" },
    link: "https://djinni.co/jobs/1",
    publishedAt: PUBLISHED_AT,
    loadedAt: PUBLISHED_AT,
    updatedAt: PUBLISHED_AT,
    title: "Senior Full Stack Engineer (Python / Node)",
    description: null,
    company: { id: "c1", name: "DataRobot", slug: "datarobot" },
    role: { id: "r1", name: "Full Stack Developer" },
    domain: { id: "d1", name: "Fintech" },
    skills: { required: [{ id: "k1", name: "Python" }], optional: [] },
    seniority: "SENIOR",
    workFormat: "REMOTE",
    employmentType: null,
    englishLevel: "UPPER_INTERMEDIATE",
    experienceYears: null,
    engagementType: null,
    hasTestAssignment: true,
    hasReservation: true,
    salary: { min: 4000, max: 6000, currency: "USD" },
    locations: ["Kyiv"],
    uniqueVacancyId: null,
    duplicateCount: null,
    duplicateSourceCount: null,
    ...overrides,
  };
}

const META = { totalNew: 1, applyBaseUrl: BASE, webBaseUrl: WEB };

describe("digest.renderer", () => {
  describe("renderDigest — card", () => {
    it("leads the headline with seniority then the bold role", () => {
      const out = renderDigest([createVacancy()], META);
      expect(out).toContain("◆ Senior · <b>Full Stack Developer</b>");
    });

    it("drops the raw scraped title but keeps company as a labeled field", () => {
      const out = renderDigest([createVacancy()], META);
      expect(out).not.toContain("Senior Full Stack Engineer");
      expect(out).toContain("co   DataRobot");
    });

    it("renders the English level without emoji noise", () => {
      const out = renderDigest([createVacancy()], META);
      expect(out).toContain("EN B2");
    });

    it("bolds reservation and a present test task as perks", () => {
      const out = renderDigest([createVacancy()], META);
      expect(out).toContain("sig  <b>бронь</b> · <b>тестове</b>");
    });

    it("surfaces the absence of a test task as a 'без тесту' plus", () => {
      const out = renderDigest(
        [createVacancy({ hasReservation: false, hasTestAssignment: false })],
        META,
      );
      expect(out).toContain("sig  <b>без тесту</b>");
      expect(out).not.toContain("бронь");
    });

    it("omits the perks line when both flags are unknown", () => {
      const out = renderDigest(
        [createVacancy({ hasReservation: null, hasTestAssignment: null })],
        META,
      );
      expect(out).not.toContain("бронь");
      expect(out).not.toContain("тесту");
    });

    it("renders required skills as [bracket] tags", () => {
      const out = renderDigest([createVacancy()], META);
      expect(out).toContain("req  [Python]");
    });

    it("separates consecutive cards with a dotted divider", () => {
      const out = renderDigest([createVacancy({ id: "a" }), createVacancy({ id: "b" })], {
        ...META,
        totalNew: 2,
      });
      expect(out).toContain("┈┈┈┈");
    });

    it("renders metahunt, tracked source, direct source links and an absolute Kyiv date", () => {
      const out = renderDigest([createVacancy()], META);
      expect(out).toContain(
        `<a href="${WEB}/vacancy/full-stack-developer-11111111-1111-1111-1111-111111111111">metahunt</a>`,
      );
      expect(out).toContain(`<a href="${BASE}/go/11111111-1111-1111-1111-111111111111">Djinni</a>`);
      expect(out).toContain(`<a href="https://djinni.co/jobs/1">direct</a>`);
      expect(out).toContain("time опубл.");
      expect(out).toContain("Kyiv");
    });

    it("labels loadedAt as found when source publishedAt is missing", () => {
      const out = renderDigest([createVacancy({ publishedAt: null })], META);
      expect(out).toContain("time знайдено");
    });

    it("stamps the apply link with ?s=<subscriptionId> for click attribution", () => {
      const out = renderDigest([createVacancy()], { ...META, subscriptionId: "sub-7" });
      expect(out).toContain(`<a href="${BASE}/go/11111111-1111-1111-1111-111111111111?s=sub-7">`);
    });

    it("escapes HTML in dynamic fields", () => {
      const out = renderDigest([createVacancy({ role: { id: "r", name: "Dev <script>" } })], META);
      expect(out).toContain("Dev &lt;script&gt;");
      expect(out).not.toContain("<script>");
    });

    it("collapses same-country locations into 'Country (City, City)'", () => {
      const out = renderDigest(
        [createVacancy({ locations: ["Kyiv, Ukraine", "Lviv, Ukraine"] })],
        META,
      );
      expect(out).toContain("Ukraine (Kyiv, Lviv)");
    });

    it("keeps mixed-country locations as a capped 'City, Country' list", () => {
      const out = renderDigest(
        [createVacancy({ locations: ["Kyiv, Ukraine", "Warsaw, Poland"] })],
        META,
      );
      expect(out).toContain("Kyiv, Ukraine · Warsaw, Poland");
    });
  });

  describe("renderDigest — header", () => {
    it("frames the count with the window when windowDays is given", () => {
      const out = renderDigest([], {
        ...META,
        totalNew: 5,
        windowDays: 14,
        label: "React",
      });
      expect(out).toBe("⌖ <b>5</b> нових за 14 дн · React");
    });

    it("drops the window framing when windowDays is omitted", () => {
      const out = renderDigest([], { ...META, totalNew: 5, label: "React" });
      expect(out).toBe("⌖ <b>5</b> нових · React");
    });
  });

  describe("paginateDigest", () => {
    it("returns no pages for an empty match", () => {
      expect(paginateDigest([], META)).toEqual([]);
    });

    it("renders one vacancy per scheduled message", () => {
      const items = Array.from({ length: 3 }, (_, i) => createVacancy({ id: `id-${i}` }));
      const pages = paginateDigest(items, { ...META, totalNew: 3 });

      expect(pages).toHaveLength(3);
      expect(pages.map((p) => p.vacancyIds)).toEqual([["id-0"], ["id-1"], ["id-2"]]);
      expect(pages[0].html).toContain("(1/3)");
      expect(pages[2].html).toContain("(3/3)");
    });

    it("does not pack multiple vacancies into one Telegram message", () => {
      const items = Array.from({ length: 11 }, (_, i) => createVacancy({ id: `id-${i}` }));
      const pages = paginateDigest(items, { ...META, totalNew: 11 });

      expect(pages).toHaveLength(11);
      expect(pages.every((p) => p.vacancyIds.length === 1)).toBe(true);
      expect(pages[0].html).toContain("(1/11)");
      expect(pages[10].html).toContain("(11/11)");
    });

    it("covers every vacancy exactly once across pages", () => {
      const items = Array.from({ length: 20 }, (_, i) => createVacancy({ id: `id-${i}` }));
      const pages = paginateDigest(items, { ...META, totalNew: 20 });
      const covered = pages.flatMap((p) => p.vacancyIds);

      expect(covered).toHaveLength(20);
      expect(new Set(covered).size).toBe(20);
    });
  });
});
