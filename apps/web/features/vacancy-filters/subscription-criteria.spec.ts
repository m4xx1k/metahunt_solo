import type { CvMatchParams } from "@/lib/api/subscriptions";

import {
  areFiltersEqual,
  filtersToSubscriptionCriteria,
  subscriptionCriteriaToFilters,
} from "./subscription-criteria";

describe("subscription criteria adapter", () => {
  const sourceId = "11111111-1111-1111-1111-111111111111";

  it("maps persisted criteria into editable filters", () => {
    expect(
      subscriptionCriteriaToFilters({
        roleIds: ["backend-developer"],
        excludedSkillIds: ["php"],
        seniorities: ["SENIOR"],
        postedWithinDays: 14,
        hasReservation: false,
      }),
    ).toMatchObject({
      roleIds: ["backend-developer"],
      excludedSkillIds: ["php"],
      seniorities: ["SENIOR"],
      freshness: "2weeks",
      reservation: false,
    });
  });

  it("keeps hidden criteria and removes cleared values", () => {
    const filters = subscriptionCriteriaToFilters({
      sourceId,
      roleIds: ["backend-developer"],
      seniorities: ["MIDDLE"],
    });
    filters.roleIds = [];
    filters.seniorities = [];
    filters.excludedSkillIds = ["php"];

    expect(
      filtersToSubscriptionCriteria(
        filters,
        {
          sourceId,
          roleIds: ["backend-developer"],
          seniorities: ["MIDDLE"],
        },
        subscriptionCriteriaToFilters({
          sourceId,
          roleIds: ["backend-developer"],
          seniorities: ["MIDDLE"],
        }),
      ),
    ).toEqual({
      sourceId,
      roleIds: undefined,
      excludedSkillIds: ["php"],
      seniorities: undefined,
      workFormats: undefined,
      englishLevels: undefined,
      employmentTypes: undefined,
      domainIds: undefined,
      experienceYears: undefined,
      hasTestAssignment: undefined,
      hasReservation: undefined,
      minFitTier: undefined,
      postedWithinDays: undefined,
    });
  });

  it("preserves custom freshness while another filter changes", () => {
    const current: CvMatchParams = { postedWithinDays: 60, seniorities: ["MIDDLE"] };
    const initial = subscriptionCriteriaToFilters(current);
    const edited = { ...initial, excludedSkillIds: ["php"] };

    expect(areFiltersEqual(initial, subscriptionCriteriaToFilters(current))).toBe(true);
    expect(filtersToSubscriptionCriteria(edited, current, initial)).toMatchObject({
      postedWithinDays: 60,
      seniorities: ["MIDDLE"],
      excludedSkillIds: ["php"],
    });
  });
});
