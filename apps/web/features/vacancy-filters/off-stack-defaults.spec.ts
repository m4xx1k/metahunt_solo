import { buildFeedListQuery } from "@/app/(feed)/_components/feed-query";
import { toLabColdQuery } from "@/app/feed/_components/lab-query";
import { EMPTY_FILTERS } from "./types";

// MET-120 / MET-144: off-stack is a pure opt-in on both feeds. The freshness
// path never hides anything, and the full scoring path hides off-stack itself
// by default — so the client omits the param entirely unless the user ticks
// "show other-stack jobs", and only then sends offStack=true.
const feedInputs = { trackActive: false, presetRoleIds: [], presetSkillIds: [], sources: [] };
const homeOffStack = (search: string) =>
  buildFeedListQuery(new URLSearchParams(search), feedInputs).query?.includeOffStack;

describe("off-stack is opt-in on both feeds", () => {
  it("omits the param by default (home)", () => {
    expect(homeOffStack("")).toBeUndefined();
  });

  it("omits the param by default (lab)", () => {
    expect(toLabColdQuery(EMPTY_FILTERS, 1).includeOffStack).toBeUndefined();
  });

  it("sends offStack=true only when the user ticked it (home)", () => {
    expect(homeOffStack("offStack=true")).toBe(true);
  });

  it("sends includeOffStack=true only when the user ticked it (lab)", () => {
    expect(toLabColdQuery({ ...EMPTY_FILTERS, includeOffStack: true }, 1).includeOffStack).toBe(
      true,
    );
  });

  it("treats an explicit ?offStack=false as no opt-in (home)", () => {
    expect(homeOffStack("offStack=false")).toBeUndefined();
  });
});
