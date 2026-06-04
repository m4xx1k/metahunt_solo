import type { VacancyDto } from "../../03-discovery/feed/feed.contract";
import { paginateDigest, renderDigest } from "./digest.renderer";

const BASE = "https://api.metahunt.io";

function createVacancy(overrides: Partial<VacancyDto> = {}): VacancyDto {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    externalId: "ext-1",
    rssRecordId: "rss-1",
    source: { id: "s1", code: "djinni", displayName: "Djinni" },
    link: "https://djinni.co/jobs/1",
    publishedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    loadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
    ...overrides,
  };
}

const META = { totalNew: 1, applyBaseUrl: BASE };

describe("digest.renderer", () => {
  describe("renderDigest — card", () => {
    it("leads the headline with seniority then the bold role", () => {
      const out = renderDigest([createVacancy()], META);
      expect(out).toContain("◆ Senior · <b>Full Stack Developer</b>");
    });

    it("drops the raw scraped title and the company name from the card", () => {
      const out = renderDigest([createVacancy()], META);
      expect(out).not.toContain("Senior Full Stack Engineer");
      expect(out).not.toContain("DataRobot");
    });

    it("renders the English level with a flag", () => {
      const out = renderDigest([createVacancy()], META);
      expect(out).toContain("🇬🇧 B2");
    });

    it("accents reservation and flags the test task when present", () => {
      const out = renderDigest([createVacancy()], META);
      expect(out).toContain("🛡 <b>Бронювання</b>");
      expect(out).toContain("📝 Тестове");
    });

    it("omits the perks line when neither flag is set", () => {
      const out = renderDigest(
        [createVacancy({ hasReservation: false, hasTestAssignment: false })],
        META,
      );
      expect(out).not.toContain("Бронювання");
      expect(out).not.toContain("Тестове");
    });

    it("routes the apply link through /go/:id and appends the relative time", () => {
      const out = renderDigest([createVacancy()], META);
      expect(out).toContain(
        `→ <a href="${BASE}/go/11111111-1111-1111-1111-111111111111">Djinni</a>`,
      );
      expect(out).toContain("позавчора");
    });

    it("stamps the apply link with ?s=<subscriptionId> for click attribution", () => {
      const out = renderDigest([createVacancy()], { ...META, subscriptionId: "sub-7" });
      expect(out).toContain(
        `<a href="${BASE}/go/11111111-1111-1111-1111-111111111111?s=sub-7">`,
      );
    });

    it("escapes HTML in dynamic fields", () => {
      const out = renderDigest(
        [createVacancy({ role: { id: "r", name: "Dev <script>" } })],
        META,
      );
      expect(out).toContain("Dev &lt;script&gt;");
      expect(out).not.toContain("<script>");
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

    it("keeps a small digest to one page without an (i/n) marker", () => {
      const items = Array.from({ length: 3 }, (_, i) =>
        createVacancy({ id: `id-${i}` }),
      );
      const pages = paginateDigest(items, { ...META, totalNew: 3 });

      expect(pages).toHaveLength(1);
      expect(pages[0].vacancyIds).toEqual(["id-0", "id-1", "id-2"]);
      expect(pages[0].html).not.toContain("(1/1)");
    });

    it("splits past the per-message cap and tags each page (i/n)", () => {
      const items = Array.from({ length: 11 }, (_, i) =>
        createVacancy({ id: `id-${i}` }),
      );
      const pages = paginateDigest(items, { ...META, totalNew: 11 });

      expect(pages).toHaveLength(2);
      expect(pages[0].vacancyIds).toHaveLength(8);
      expect(pages[1].vacancyIds).toHaveLength(3);
      expect(pages[0].html).toContain("(1/2)");
      expect(pages[1].html).toContain("(2/2)");
    });

    it("covers every vacancy exactly once across pages", () => {
      const items = Array.from({ length: 20 }, (_, i) =>
        createVacancy({ id: `id-${i}` }),
      );
      const pages = paginateDigest(items, { ...META, totalNew: 20 });
      const covered = pages.flatMap((p) => p.vacancyIds);

      expect(covered).toHaveLength(20);
      expect(new Set(covered).size).toBe(20);
    });
  });
});
