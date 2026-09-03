import { cvApi } from "@/lib/api/cv";
import { vacanciesApi } from "@/lib/api/vacancies";

import { EMPTY_FILTERS, type FilterState } from "./types";
import {
  fetchMatch,
  warmFilterKey,
  HOME_INCLUDE_OFF_STACK,
  LAB_INCLUDE_OFF_STACK,
} from "./warm-query";

jest.mock("@/lib/api/vacancies", () => ({
  ...jest.requireActual("@/lib/api/vacancies"),
  vacanciesApi: { list: jest.fn() },
}));
jest.mock("@/lib/api/cv", () => ({
  cvApi: { get: jest.fn() },
}));

const list = vacanciesApi.list as jest.Mock;
const get = cvApi.get as jest.Mock;

beforeEach(() => {
  list.mockReset().mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    offStackHidden: 0,
    viewerSkills: [],
  });
  get.mockReset().mockResolvedValue({ unmatched: [] });
});

const sentOffStack = async (filters: FilterState, routeDefault: boolean) => {
  list.mockClear();
  await fetchMatch("cand-1", filters, 1, false, routeDefault);
  return list.mock.calls[0][0].includeOffStack;
};

// MET-120 regression: off-stack became an opt-in filter on /feed, and a single
// shared default would have silently hidden ~47% of the home feed's matches.
describe("off-stack default per route", () => {
  it("keeps off-stack matches on the home feed when the user has no preference", async () => {
    expect(await sentOffStack(EMPTY_FILTERS, HOME_INCLUDE_OFF_STACK)).toBe(true);
  });

  it("hides them on the /feed lab when the user has no preference", async () => {
    expect(await sentOffStack(EMPTY_FILTERS, LAB_INCLUDE_OFF_STACK)).toBeUndefined();
  });

  it("lets an explicit preference override the route default either way", async () => {
    expect(
      await sentOffStack({ ...EMPTY_FILTERS, includeOffStack: false }, HOME_INCLUDE_OFF_STACK),
    ).toBeUndefined();
    expect(
      await sentOffStack({ ...EMPTY_FILTERS, includeOffStack: true }, LAB_INCLUDE_OFF_STACK),
    ).toBe(true);
  });

  it("resolves the default into the query key, so the two routes never share a cache entry", () => {
    expect(warmFilterKey(EMPTY_FILTERS, HOME_INCLUDE_OFF_STACK).includeOffStack).toBe(true);
    expect(warmFilterKey(EMPTY_FILTERS, LAB_INCLUDE_OFF_STACK).includeOffStack).toBe(false);
  });
});

// MET-144: fetchMatch goes through the unified GET /feed now, not
// /cv/:id/matches or /cv/samples/:id/matches — a real (non-sample)
// candidateId never travels as a query param (the JWT's active CV resolves
// it server-side); only a sample id does, via `sample`.
describe("candidate routing", () => {
  it("never sends the candidateId as a query param for a real CV", async () => {
    await fetchMatch("cand-1", EMPTY_FILTERS, 1, false, HOME_INCLUDE_OFF_STACK);

    expect(list.mock.calls[0][0].sample).toBeUndefined();
    expect(get).toHaveBeenCalledWith("cand-1");
  });

  it("sends the candidateId as ?sample= for a sample", async () => {
    await fetchMatch("sample-1", EMPTY_FILTERS, 1, true, HOME_INCLUDE_OFF_STACK);

    expect(list.mock.calls[0][0].sample).toBe("sample-1");
  });

  it("defaults sort to score (the warm lens's own locked default) when untouched", async () => {
    await fetchMatch("cand-1", EMPTY_FILTERS, 1, false, HOME_INCLUDE_OFF_STACK);

    expect(list.mock.calls[0][0].sort).toBe("score");
  });

  it("propagates a GET /cv/:id failure (a stale/deleted CV) instead of silently returning cold results", async () => {
    get.mockRejectedValue(new Error("api 404 /cv/cand-1"));

    await expect(
      fetchMatch("cand-1", EMPTY_FILTERS, 1, false, HOME_INCLUDE_OFF_STACK),
    ).rejects.toThrow("api 404");
  });
});
