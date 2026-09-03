import type { ListVacanciesResponse, VacancyDto } from "@/lib/api/vacancies";

import { toMatchResponse } from "./to-match-response";

const BASE_VACANCY = {
  id: "v1",
  externalId: "ext-1",
  rssRecordId: "rss-1",
  source: { id: "src-1", code: "dou", displayName: "DOU" },
  link: null,
  publishedAt: null,
  loadedAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  title: "Backend Engineer",
  description: null,
  company: null,
  role: null,
  domain: null,
  seniority: null,
  workFormat: null,
  employmentType: null,
  englishLevel: null,
  experienceYears: null,
  engagementType: null,
  hasTestAssignment: null,
  hasReservation: null,
  salary: { min: null, max: null, currency: null },
  locations: [],
  uniqueVacancyId: null,
  duplicateCount: null,
  duplicateSourceCount: null,
} satisfies Partial<VacancyDto>;

describe("toMatchResponse", () => {
  it("derives fit.matchedRequired/requiredTotal and diff from skills + viewerSkills", () => {
    const required1 = { id: "req-1", name: "Go" }; // viewer has it
    const required2 = { id: "req-2", name: "Kubernetes" }; // viewer lacks it
    const bonusSkill = { id: "bonus-1", name: "Rust" };
    const vacancy: VacancyDto = {
      ...BASE_VACANCY,
      skills: { required: [required1, required2], optional: [] },
      match: { relevance: 1, coverage: 0.5, tier: "GOOD", percent: 50, onStack: true },
    };
    const feed: ListVacanciesResponse = {
      items: [vacancy],
      page: 1,
      pageSize: 20,
      total: 1,
      offStackHidden: 0,
      viewerSkills: [required1, bonusSkill],
    };

    const result = toMatchResponse(feed, ["SomeUnknownSkill"]);

    expect(result.resolved).toEqual({
      matched: [
        { id: "req-1", name: "Go", weight: 0 },
        { id: "bonus-1", name: "Rust", weight: 0 },
      ],
      unmatched: ["SomeUnknownSkill"],
    });
    const item = result.items[0];
    expect(item.fit).toEqual({ tier: "GOOD", percent: 50, matchedRequired: 1, requiredTotal: 2 });
    expect(item.onStack).toBe(true);
    expect(item.diff.have.map((s) => s.id)).toEqual(["req-1"]);
    expect(item.diff.missing.map((s) => s.id)).toEqual(["req-2"]);
    expect(item.diff.bonus.map((s) => s.id)).toEqual(["bonus-1"]);
    expect(item.breakdown).toEqual({
      total: 0.5,
      signals: [{ kind: "skill-overlap", raw: 0.5, weight: 1, contribution: 0.5 }],
    });
  });

  it("falls back to STRETCH/0%/on-stack for a card with nothing scored", () => {
    const vacancy: VacancyDto = {
      ...BASE_VACANCY,
      skills: { required: [], optional: [] },
      match: null,
    };
    const feed: ListVacanciesResponse = {
      items: [vacancy],
      page: 1,
      pageSize: 20,
      total: 1,
      offStackHidden: 0,
      viewerSkills: [],
    };

    const result = toMatchResponse(feed, []);

    expect(result.items[0].fit).toEqual({
      tier: "STRETCH",
      percent: 0,
      matchedRequired: 0,
      requiredTotal: 0,
    });
    expect(result.items[0].onStack).toBe(true);
    expect(result.items[0].relevance).toBe(0);
  });

  it("treats an absent viewerSkills as no viewer at all", () => {
    const feed: ListVacanciesResponse = {
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      offStackHidden: 0,
    };

    expect(toMatchResponse(feed, []).resolved.matched).toEqual([]);
  });
});
