import {
  FEED_INDEX_DESCRIPTION,
  FEED_INDEX_TITLE,
  trackDescription,
  trackIntro,
  trackTitle,
  trackVacancyPhrase,
} from "./feed-meta";

// Every label the tracks tree actually serves, including the awkward ones.
const LABELS = [
  "Backend",
  "Data & AI",
  "QA",
  "DevOps",
  "GameDev",
  "C#",
  "Node.js",
  "AWS",
  "Computer Vision",
  "Data Engineering",
  "ML Engineering",
];

// Google truncates the SERP title near 60 characters and the snippet near 160.
const TITLE_MAX = 60;
const BRAND_SUFFIX = " · metahunt";

describe("trackVacancyPhrase", () => {
  it("agrees the noun with the count", () => {
    expect(trackVacancyPhrase(1, "Backend")).toContain("1 вакансія Backend");
    expect(trackVacancyPhrase(2463, "Backend")).toContain("вакансії Backend");
    expect(trackVacancyPhrase(15, "Blockchain")).toContain("вакансій Blockchain");
    expect(trackVacancyPhrase(107, "GameDev")).toContain("вакансій GameDev");
  });

  it("groups thousands the Ukrainian way, not with a comma", () => {
    expect(trackVacancyPhrase(2463, "Backend")).not.toContain(",");
    expect(trackVacancyPhrase(2463, "Backend")).toMatch(/^2\s463 /);
  });

  it("keeps 11-14 in the genitive plural", () => {
    // 12 takes "вакансій", not "вакансії" — the trap in Slavic plural rules.
    expect(trackVacancyPhrase(12, "Vue.js")).toContain("вакансій");
    expect(trackVacancyPhrase(112, "Vue.js")).toContain("вакансій");
  });
});

describe("trackTitle", () => {
  it("fits the SERP budget once the brand suffix is appended", () => {
    for (const label of LABELS) {
      const rendered = `${trackTitle(label)}${BRAND_SUFFIX}`;
      expect(rendered.length).toBeLessThanOrEqual(TITLE_MAX);
    }
  });

  it("is unique per label", () => {
    const titles = LABELS.map(trackTitle);
    expect(new Set(titles).size).toBe(LABELS.length);
  });

  it("carries no live count, so the title stays stable between ingests", () => {
    expect(trackTitle("Backend")).not.toMatch(/\d/);
  });
});

describe("trackDescription", () => {
  it("stays inside the snippet budget for every label", () => {
    for (const label of LABELS) {
      const d = trackDescription({ label, count: 2463 });
      expect(d.length).toBeGreaterThanOrEqual(110);
      expect(d.length).toBeLessThanOrEqual(165);
    }
  });

  it("is unique per label", () => {
    const all = LABELS.map((label) => trackDescription({ label, count: 100 }));
    expect(new Set(all).size).toBe(LABELS.length);
  });
});

describe("feed index copy", () => {
  it("fits the SERP budget", () => {
    // The index title is absolute (no template), so it carries the brand itself.
    expect(FEED_INDEX_TITLE.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(FEED_INDEX_TITLE).toContain("metahunt");
    expect(FEED_INDEX_DESCRIPTION.length).toBeLessThanOrEqual(165);
    expect(FEED_INDEX_DESCRIPTION.length).toBeGreaterThanOrEqual(110);
  });

  it("does not collide with any track's copy", () => {
    for (const label of LABELS) {
      expect(trackTitle(label)).not.toBe(FEED_INDEX_TITLE);
      expect(trackDescription({ label, count: 100 })).not.toBe(FEED_INDEX_DESCRIPTION);
    }
  });
});

describe("trackIntro", () => {
  it("names the track and its supply", () => {
    const intro = trackIntro({ label: "DevOps", count: 1584 });
    expect(intro).toContain("DevOps");
    expect(intro).toMatch(/^1\s584 вакансії DevOps/);
  });
});
