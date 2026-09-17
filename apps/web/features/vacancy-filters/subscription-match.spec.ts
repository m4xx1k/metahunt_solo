import type { MeSubscription } from "@/lib/api/me";

import { findMatchingSubscription } from "./subscription-criteria";

const CANDIDATE = "11111111-1111-1111-1111-111111111111";

function feedSub(params: MeSubscription["params"], id = "feed"): MeSubscription {
  return {
    id,
    name: "feed",
    label: "feed",
    isActive: true,
    status: "live" as const,
    createdAt: "",
    tgUsername: null,
    tgFirstName: null,
    isCv: false,
    candidateId: null,
    params,
  } as MeSubscription;
}

function cvSub(params: MeSubscription["params"], id = "cv"): MeSubscription {
  return { ...feedSub(params, id), isCv: true, candidateId: CANDIDATE } as MeSubscription;
}

describe("findMatchingSubscription", () => {
  it("matches the same filter whatever order its lists arrived in", () => {
    const subs = [feedSub({ roleIds: ["b", "a"], postedWithinDays: 30 })];
    expect(findMatchingSubscription(subs, { roleIds: ["a", "b"], postedWithinDays: 30 })).toBe(
      subs[0],
    );
  });

  it("ignores absent vs empty-list differences", () => {
    const subs = [feedSub({ roleIds: ["a"], skillIds: [], postedWithinDays: 30 })];
    expect(findMatchingSubscription(subs, { roleIds: ["a"], postedWithinDays: 30 })).toBe(subs[0]);
  });

  it("does not match a narrower filter", () => {
    const subs = [feedSub({ roleIds: ["a"], postedWithinDays: 30 })];
    expect(findMatchingSubscription(subs, { roleIds: ["a"], seniorities: ["SENIOR"] })).toBeNull();
  });

  // A CV ranks a digest, it does not narrow it, so a legacy CV subscription on
  // this filter is still "you already have this" — otherwise replaying one from
  // the saved list left the card offering to create its twin.
  it("matches a CV subscription on the filter alone", () => {
    const params = { roleIds: ["a"], postedWithinDays: 30 };
    expect(findMatchingSubscription([cvSub(params)], params)).not.toBeNull();
    expect(findMatchingSubscription([feedSub(params)], params)).not.toBeNull();
  });

  // `false` is a filter ("no test assignment"), absence is "don't care" — the
  // normalizer drops null/undefined/[] but must keep false, or the card would
  // call a wider subscription an exact match and never offer the narrow one.
  it("does not treat a false-valued flag as unset", () => {
    const subs = [feedSub({ roleIds: ["a"], postedWithinDays: 30 })];
    expect(
      findMatchingSubscription(subs, {
        roleIds: ["a"],
        postedWithinDays: 30,
        hasReservation: false,
      }),
    ).toBeNull();
  });

  it("matches a false-valued flag on both sides", () => {
    const params = { roleIds: ["a"], postedWithinDays: 30, hasReservation: false };
    expect(findMatchingSubscription([feedSub(params)], { ...params })).not.toBeNull();
  });

  it("has nothing to match before the list loads", () => {
    expect(findMatchingSubscription(undefined, { roleIds: ["a"] })).toBeNull();
  });
});
