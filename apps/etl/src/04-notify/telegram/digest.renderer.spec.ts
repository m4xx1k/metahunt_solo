import type { VacancyDto } from "../../03-discovery/feed/feed.contract";

import { paginateDigest, renderDigest } from "./digest.renderer";

const BASE = "https://api.metahunt.io";
const WEB = "https://www.metahunt.app";
const PUBLISHED_AT = "2026-08-01T10:30:00.000Z";
const METAHUNT_URL = `${WEB}/vacancy/full-stack-developer-11111111-1111-1111-1111-111111111111`;

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
    match: null,
    ...overrides,
  };
}

const META = { totalNew: 1, applyBaseUrl: BASE, webBaseUrl: WEB };

describe("digest.renderer", () => {
  describe("renderDigest — card", () => {
    it("fuses seniority and role into one solid bold phrase that is itself the metahunt link", () => {
      const out = renderDigest([createVacancy()], META);
      expect(out).toContain(`◆ <a href="${METAHUNT_URL}"><b>Senior Full Stack Developer</b></a>`);
      expect(out).not.toContain("Senior · <b>");
    });

    it("drops the raw scraped title but shows salary, an underlined company and domain on one line", () => {
      const out = renderDigest([createVacancy()], META);
      expect(out).not.toContain("Senior Full Stack Engineer");
      expect(out).toContain("<b>$4000–6000</b> · <u>DataRobot</u> · Fintech");
    });

    it("renders required skills as [bracket] tags, not code blocks", () => {
      const out = renderDigest([createVacancy()], META);
      expect(out).toContain("[Python]");
      expect(out).not.toContain("<code>");
    });

    it("caps skills at 5 and tags the overflow count", () => {
      const skills = Array.from({ length: 7 }, (_, i) => ({ id: `k${i}`, name: `Skill${i}` }));
      const out = renderDigest(
        [createVacancy({ skills: { required: skills, optional: [] } })],
        META,
      );
      expect(out).toContain("[Skill0] [Skill1] [Skill2] [Skill3] [Skill4] +2");
      expect(out).not.toContain("[Skill5]");
    });
  });

  describe("renderDigest — Деталі: block", () => {
    it("labels the section and writes every condition as its own plain-language line, in order", () => {
      const out = renderDigest([createVacancy({ experienceYears: 5 })], META);
      const detailsBlock = out.slice(out.indexOf("Деталі:"), out.indexOf("знайдено на"));
      const expectedLines = [
        "Деталі:",
        "[Python]",
        "Англійська — B2",
        "Від 5 років досвіду",
        "Віддалена робота",
        "Локація: Kyiv",
        "Надають бронювання",
        "Є тестове завдання",
      ];
      const actualLines = detailsBlock
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      expect(actualLines).toEqual(expectedLines);
    });

    it("writes 'Без тестового завдання' when a test task is explicitly absent (a plus, not a gap)", () => {
      const out = renderDigest([createVacancy({ hasTestAssignment: false })], META);
      expect(out).toContain("Без тестового завдання");
      expect(out).not.toContain("Є тестове завдання");
    });

    it("omits the test-assignment line entirely when unknown (null), not a false negative", () => {
      const out = renderDigest([createVacancy({ hasTestAssignment: null })], META);
      expect(out).not.toContain("тестове завдання");
    });

    it("omits the reservation line when false or unknown — only a confirmed offer is worth a line", () => {
      const falseCase = renderDigest([createVacancy({ hasReservation: false })], META);
      const nullCase = renderDigest([createVacancy({ hasReservation: null })], META);
      expect(falseCase).not.toContain("бронювання");
      expect(nullCase).not.toContain("бронювання");
    });

    it("omits the skills line when there are no required skills", () => {
      const out = renderDigest([createVacancy({ skills: { required: [], optional: [] } })], META);
      expect(out).not.toContain("[Python]");
    });

    it("omits the English line when the level is unknown", () => {
      const out = renderDigest([createVacancy({ englishLevel: null })], META);
      expect(out).not.toContain("Англійська");
    });

    it("omits the experience line when years are unknown", () => {
      const out = renderDigest([createVacancy({ experienceYears: null })], META);
      expect(out).not.toContain("років досвіду");
    });

    it("writes 'Без досвіду' for zero years, not 'Від 0 років досвіду'", () => {
      const out = renderDigest([createVacancy({ experienceYears: 0 })], META);
      expect(out).toContain("Без досвіду");
      expect(out).not.toContain("Від 0");
    });

    it("omits the format line when work format is unknown", () => {
      const out = renderDigest([createVacancy({ workFormat: null })], META);
      expect(out).not.toContain("робота");
      expect(out).not.toContain("Гібридний");
    });

    it("writes each work format as its own plain-language sentence", () => {
      expect(renderDigest([createVacancy({ workFormat: "REMOTE" })], META)).toContain(
        "Віддалена робота",
      );
      expect(renderDigest([createVacancy({ workFormat: "OFFICE" })], META)).toContain(
        "Робота в офісі",
      );
      expect(renderDigest([createVacancy({ workFormat: "HYBRID" })], META)).toContain(
        "Гібридний формат",
      );
    });

    it("omits the location line when there are no locations", () => {
      const out = renderDigest([createVacancy({ locations: [] })], META);
      expect(out).not.toContain("Локація:");
    });

    it("drops the Деталі: header entirely when every condition is unknown — no empty section", () => {
      const out = renderDigest(
        [
          createVacancy({
            skills: { required: [], optional: [] },
            englishLevel: null,
            experienceYears: null,
            workFormat: null,
            locations: [],
            hasReservation: null,
            hasTestAssignment: null,
          }),
        ],
        META,
      );
      expect(out).not.toContain("Деталі:");
    });
  });

  describe("renderDigest — misc", () => {
    it("separates consecutive cards with a dotted divider", () => {
      const out = renderDigest([createVacancy({ id: "a" }), createVacancy({ id: "b" })], {
        ...META,
        totalNew: 2,
      });
      expect(out).toContain("┈┈┈┈");
    });

    it("labels the tracked source link 'знайдено на <source>', with no separate metahunt link line", () => {
      const out = renderDigest([createVacancy()], META);
      expect(out).toContain(
        `знайдено на <a href="${BASE}/go/11111111-1111-1111-1111-111111111111">Djinni</a>`,
      );
      expect(out).not.toContain("Відкрити на metahunt");
      expect(out).not.toContain(`<a href="https://djinni.co/jobs/1">`);
    });

    it("omits the source line entirely when there's no source link", () => {
      const out = renderDigest([createVacancy({ link: null })], META);
      expect(out).not.toContain("знайдено на");
    });

    it("never renders a publish date or a quoted description", () => {
      const out = renderDigest(
        [createVacancy({ description: "We build fintech tools, join the team." })],
        META,
      );
      expect(out).not.toContain("опубл.");
      expect(out).not.toContain("blockquote");
      expect(out).not.toContain("fintech tools");
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

    it("renders one vacancy per scheduled message, with no repeated header", () => {
      const items = Array.from({ length: 3 }, (_, i) => createVacancy({ id: `id-${i}` }));
      const pages = paginateDigest(items, { ...META, totalNew: 3 });

      expect(pages).toHaveLength(3);
      expect(pages.map((p) => p.vacancyIds)).toEqual([["id-0"], ["id-1"], ["id-2"]]);
      expect(pages[0].html).not.toContain("⌖");
      expect(pages[0].html).not.toContain("нових");
    });

    it("does not pack multiple vacancies into one Telegram message", () => {
      const items = Array.from({ length: 11 }, (_, i) => createVacancy({ id: `id-${i}` }));
      const pages = paginateDigest(items, { ...META, totalNew: 11 });

      expect(pages).toHaveLength(11);
      expect(pages.every((p) => p.vacancyIds.length === 1)).toBe(true);
    });

    it("covers every vacancy exactly once across pages", () => {
      const items = Array.from({ length: 20 }, (_, i) => createVacancy({ id: `id-${i}` }));
      const pages = paginateDigest(items, { ...META, totalNew: 20 });
      const covered = pages.flatMap((p) => p.vacancyIds);

      expect(covered).toHaveLength(20);
      expect(new Set(covered).size).toBe(20);
    });

    it("never appends a subscription-name footer (dropped — auto-generated names read as garbage)", () => {
      const pages = paginateDigest([createVacancy()], { ...META, label: "Cosmic Badger" });
      expect(pages[0].html).not.toContain("Cosmic Badger");
      expect(pages[0].html).not.toContain("/list");
      expect(pages[0].html).not.toContain("<i>");
    });
  });
});
