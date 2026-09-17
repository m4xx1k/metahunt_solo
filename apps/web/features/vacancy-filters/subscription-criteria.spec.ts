import type { SubscriptionFilter } from "@/lib/api/subscriptions";

import { filtersDiffer, filterToState, stateToFilter } from "./subscription-criteria";
import { DEFAULT_FRESHNESS } from "./types";

describe("subscription filter codec", () => {
  const sourceId = "11111111-1111-1111-1111-111111111111";

  it("maps a stored filter into the rail's state", () => {
    expect(
      filterToState({
        roleIds: ["backend-developer"],
        excludedSkillIds: ["php"],
        seniorities: ["SENIOR"],
        hasReservation: false,
      }),
    ).toMatchObject({
      roleIds: ["backend-developer"],
      excludedSkillIds: ["php"],
      seniorities: ["SENIOR"],
      reservation: false,
    });
  });

  // Regression: skillIds had no writer, so the rail let you edit the skills of a
  // subscription and silently saved the old ones back.
  it("round-trips must-have skills", () => {
    const stored: SubscriptionFilter = { skillIds: ["typescript", "nestjs"] };

    expect(filterToState(stored).skillIds).toEqual(["typescript", "nestjs"]);
    expect(stateToFilter(filterToState(stored)).skillIds).toEqual(["typescript", "nestjs"]);
  });

  it("carries sourceId across a round-trip the rail cannot express", () => {
    const stored: SubscriptionFilter = { sourceId, roleIds: ["backend-developer"] };
    const state = filterToState(stored);

    expect(state.sourceCode).toBeNull();
    expect(stateToFilter(state, stored.sourceId).sourceId).toBe(sourceId);
  });

  it("drops cleared axes instead of storing empty arrays", () => {
    const state = filterToState({ roleIds: ["backend-developer"], seniorities: ["MIDDLE"] });
    state.roleIds = [];
    state.seniorities = [];
    state.excludedSkillIds = ["php"];

    expect(stateToFilter(state, sourceId)).toEqual({
      sourceId,
      roleIds: undefined,
      skillIds: undefined,
      excludedSkillIds: ["php"],
      domainIds: undefined,
      seniorities: undefined,
      workFormats: undefined,
      englishLevels: undefined,
      employmentTypes: undefined,
      experienceYears: undefined,
      hasTestAssignment: undefined,
      hasReservation: undefined,
    });
  });

  // Freshness, sort and the fit gate are rail-only: none of them is stored, so
  // touching one must not report the subscription as edited.
  it("ignores rail-only axes when deciding whether anything changed", () => {
    const stored: SubscriptionFilter = { seniorities: ["MIDDLE"] };
    const state = filterToState(stored);

    expect(filtersDiffer(stateToFilter(state), stored)).toBe(false);

    const noisy = { ...state, freshness: "week", minFitTier: "STRONG", sort: "score" };
    expect(noisy.freshness).not.toBe(DEFAULT_FRESHNESS);
    expect(filtersDiffer(stateToFilter(noisy), stored)).toBe(false);

    const real = { ...state, excludedSkillIds: ["php"] };
    expect(filtersDiffer(stateToFilter(real), stored)).toBe(true);
  });
});
