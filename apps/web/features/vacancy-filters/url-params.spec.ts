import { EMPTY_FILTERS, type FilterState } from "./types";
import { readFilterState, writeFilterState } from "./url-params";

// Every axis set to a non-default value, so a key dropped by either half of the
// codec shows up as a diff instead of silently matching the default.
const FULL: FilterState = {
  roleIds: ["backend-engineer", "sre"],
  skillIds: ["go", "postgresql"],
  excludedSkillIds: ["php"],
  domainIds: ["fintech"],
  sourceCode: "dou",
  seniorities: ["MIDDLE", "SENIOR"],
  workFormats: ["REMOTE"],
  englishLevels: ["UPPER_INTERMEDIATE"],
  employmentTypes: ["FULL_TIME"],
  experienceYears: ["3", "6+"],
  freshness: "week",
  test: false,
  reservation: true,
  minFitTier: "STRONG",
  sort: "score",
  includeOffStack: true,
};

const roundTrip = (f: FilterState): FilterState => {
  const params = new URLSearchParams();
  writeFilterState(params, f);
  return readFilterState(params);
};

describe("writeFilterState / readFilterState", () => {
  it("round-trips every filter axis", () => {
    expect(roundTrip(FULL)).toEqual(FULL);
  });

  it("round-trips the empty filter", () => {
    expect(roundTrip(EMPTY_FILTERS)).toEqual(EMPTY_FILTERS);
  });

  // hasReservation:false is a real filter ("no reservation"), not "unset" — the
  // tristate has to survive as `false` rather than collapsing to null.
  it("keeps a false-valued flag apart from an unset one", () => {
    expect(roundTrip({ ...EMPTY_FILTERS, test: false, reservation: false })).toMatchObject({
      test: false,
      reservation: false,
    });
    expect(roundTrip(EMPTY_FILTERS)).toMatchObject({ test: null, reservation: null });
  });

  // The reason writeFilterState exists: replaying a saved subscription must not
  // inherit an axis from whatever filter was on screen before it.
  it("leaves nothing behind from the previous filter", () => {
    const params = new URLSearchParams();
    writeFilterState(params, FULL);
    writeFilterState(params, EMPTY_FILTERS);
    expect([...params.keys()].sort()).toEqual(["roles", "skills"]);
    expect(params.get("roles")).toBe("");
    expect(params.get("skills")).toBe("");
  });

  // An absent roles/skills is how a track route says "use my preset", so a
  // replayed alert with no role has to say empty out loud — otherwise landing
  // on /backend silently re-adds the backend roles the alert never had.
  it("writes an empty axis explicitly so a track preset can't refill it", () => {
    const params = new URLSearchParams({ roles: "sre" });
    writeFilterState(params, EMPTY_FILTERS);
    expect(params.has("roles")).toBe(true);
    expect(params.get("roles")).toBe("");
  });

  // Clearing is the opposite intent: drop back to whatever the route provides.
  it("drops the axis keys entirely when clearing to the preset", () => {
    const params = new URLSearchParams();
    writeFilterState(params, FULL);
    writeFilterState(params, EMPTY_FILTERS, "preset");
    expect([...params.keys()]).toEqual([]);
  });

  it("clears only one axis when only that axis empties", () => {
    const params = new URLSearchParams();
    writeFilterState(params, FULL);
    writeFilterState(params, { ...FULL, skillIds: [], minFitTier: null });
    expect(params.get("skills")).toBe("");
    expect(params.has("minFitTier")).toBe(false);
    expect(params.get("roles")).toBe("backend-engineer,sre");
  });

  // The scope toggles shape the result set but are never part of a saved
  // subscription, so a replay that kept them would show a different list than
  // the digest sends.
  it("drops the feed scope toggles", () => {
    const params = new URLSearchParams({ nice: "true", dupes: "true" });
    writeFilterState(params, FULL);
    expect(params.has("nice")).toBe(false);
    expect(params.has("dupes")).toBe(false);
  });

  it("keeps the default freshness out of the URL", () => {
    const params = new URLSearchParams();
    writeFilterState(params, EMPTY_FILTERS);
    expect(params.has("fresh")).toBe(false);
  });

  it("does not touch pagination", () => {
    const params = new URLSearchParams({ offset: "40" });
    writeFilterState(params, FULL);
    expect(params.get("offset")).toBe("40");
  });
});
