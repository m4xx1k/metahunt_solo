import { cvApi } from "@/lib/api/cv";

import { EMPTY_FILTERS, type FilterState } from "./types";
import {
  fetchMatch,
  warmFilterKey,
  HOME_INCLUDE_OFF_STACK,
  LAB_INCLUDE_OFF_STACK,
} from "./warm-query";

jest.mock("@/lib/api/cv", () => ({
  cvApi: { matches: jest.fn(), sampleMatches: jest.fn() },
}));

const matches = cvApi.matches as jest.Mock;

const sentOffStack = (filters: FilterState, routeDefault: boolean) => {
  matches.mockClear();
  void fetchMatch("cand-1", filters, 1, false, routeDefault);
  return matches.mock.calls[0][1].includeOffStack;
};

// MET-120 regression: off-stack became an opt-in filter on /feed, and a single
// shared default would have silently hidden ~47% of the home feed's matches.
describe("off-stack default per route", () => {
  it("keeps off-stack matches on the home feed when the user has no preference", () => {
    expect(sentOffStack(EMPTY_FILTERS, HOME_INCLUDE_OFF_STACK)).toBe(true);
  });

  it("hides them on the /feed lab when the user has no preference", () => {
    expect(sentOffStack(EMPTY_FILTERS, LAB_INCLUDE_OFF_STACK)).toBeUndefined();
  });

  it("lets an explicit preference override the route default either way", () => {
    expect(
      sentOffStack({ ...EMPTY_FILTERS, includeOffStack: false }, HOME_INCLUDE_OFF_STACK),
    ).toBeUndefined();
    expect(sentOffStack({ ...EMPTY_FILTERS, includeOffStack: true }, LAB_INCLUDE_OFF_STACK)).toBe(
      true,
    );
  });

  it("resolves the default into the query key, so the two routes never share a cache entry", () => {
    expect(warmFilterKey(EMPTY_FILTERS, HOME_INCLUDE_OFF_STACK).includeOffStack).toBe(true);
    expect(warmFilterKey(EMPTY_FILTERS, LAB_INCLUDE_OFF_STACK).includeOffStack).toBe(false);
  });
});
