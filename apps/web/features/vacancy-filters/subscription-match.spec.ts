import type { MeSubscription } from "@/lib/api/me";

import { findMatchingSubscription } from "./subscription-criteria";

const CANDIDATE = "11111111-1111-1111-1111-111111111111";

function feedSub(params: MeSubscription["params"], id = "feed"): MeSubscription {
  return {
    id,
    name: "feed",
    label: "feed",
    isActive: true,
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
    expect(
      findMatchingSubscription(subs, { roleIds: ["a", "b"], postedWithinDays: 30 }, null),
    ).toBe(subs[0]);
  });

  it("ignores absent vs empty-list differences", () => {
    const subs = [feedSub({ roleIds: ["a"], skillIds: [], postedWithinDays: 30 })];
    expect(findMatchingSubscription(subs, { roleIds: ["a"], postedWithinDays: 30 }, null)).toBe(
      subs[0],
    );
  });

  it("does not match a narrower filter", () => {
    const subs = [feedSub({ roleIds: ["a"], postedWithinDays: 30 })];
    expect(
      findMatchingSubscription(subs, { roleIds: ["a"], seniorities: ["SENIOR"] }, null),
    ).toBeNull();
  });

  // Same criteria, different digest: one is ranked against the CV, one isn't.
  it("keeps a CV subscription apart from a plain one", () => {
    const params = { roleIds: ["a"], postedWithinDays: 30 };
    expect(findMatchingSubscription([cvSub(params)], params, null)).toBeNull();
    expect(findMatchingSubscription([feedSub(params)], params, CANDIDATE)).toBeNull();
    expect(findMatchingSubscription([cvSub(params)], params, CANDIDATE)).not.toBeNull();
  });

  // `false` is a filter ("no test assignment"), absence is "don't care" — the
  // normalizer drops null/undefined/[] but must keep false, or the card would
  // call a wider subscription an exact match and never offer the narrow one.
  it("does not treat a false-valued flag as unset", () => {
    const subs = [feedSub({ roleIds: ["a"], postedWithinDays: 30 })];
    expect(
      findMatchingSubscription(
        subs,
        { roleIds: ["a"], postedWithinDays: 30, hasReservation: false },
        null,
      ),
    ).toBeNull();
  });

  it("matches a false-valued flag on both sides", () => {
    const params = { roleIds: ["a"], postedWithinDays: 30, hasReservation: false };
    expect(findMatchingSubscription([feedSub(params)], { ...params }, null)).not.toBeNull();
  });

  it("has nothing to match before the list loads", () => {
    expect(findMatchingSubscription(undefined, { roleIds: ["a"] }, null)).toBeNull();
  });
});
