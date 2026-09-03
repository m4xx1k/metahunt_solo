import { buildFeedListQuery } from "@/app/(feed)/_components/feed-query";
import { toLabColdQuery } from "@/app/feed/_components/lab-query";
import { EMPTY_FILTERS, HOME_INCLUDE_OFF_STACK, LAB_INCLUDE_OFF_STACK } from "./types";

// MET-120 regression: off-stack is an opt-in filter on /feed, and a single
// shared default would silently hide ~47% of the home feed's matches. Each
// route states its own default; an explicit preference overrides it either way.
const feedInputs = { trackActive: false, presetRoleIds: [], presetSkillIds: [], sources: [] };
const homeOffStack = (search: string) =>
  buildFeedListQuery(new URLSearchParams(search), feedInputs).query?.includeOffStack;

describe("off-stack default per route", () => {
  it("the two route defaults differ", () => {
    expect(HOME_INCLUDE_OFF_STACK).toBe(true);
    expect(LAB_INCLUDE_OFF_STACK).toBe(false);
  });

  it("keeps off-stack matches on the home feed when the user has no preference", () => {
    expect(homeOffStack("")).toBe(true);
  });

  it("hides them on the /feed lab when the user has no preference", () => {
    expect(toLabColdQuery(EMPTY_FILTERS, 1).includeOffStack).toBeUndefined();
  });

  it("lets an explicit preference override the route default either way", () => {
    expect(homeOffStack("offStack=false")).toBeUndefined();
    expect(toLabColdQuery({ ...EMPTY_FILTERS, includeOffStack: true }, 1).includeOffStack).toBe(
      true,
    );
  });
});
