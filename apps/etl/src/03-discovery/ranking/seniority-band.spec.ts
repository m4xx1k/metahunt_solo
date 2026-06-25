import { cohortSeniorities } from "./seniority-band";

// Band is the candidate's level ±1 on the ladder (INTERN…C_LEVEL); NULL-seniority
// vacancies are folded in by the SQL, not here. Unknown/missing → whole ladder.
describe("cohortSeniorities", () => {
  it("returns the level plus one step on each side", () => {
    expect(cohortSeniorities("MIDDLE")).toEqual(["JUNIOR", "MIDDLE", "SENIOR"]);
  });

  it("clamps at the bottom of the ladder", () => {
    expect(cohortSeniorities("INTERN")).toEqual(["INTERN", "JUNIOR"]);
  });

  it("clamps at the top of the ladder", () => {
    expect(cohortSeniorities("C_LEVEL")).toEqual(["PRINCIPAL", "C_LEVEL"]);
  });

  it("widens to the whole ladder for a missing level", () => {
    expect(cohortSeniorities(null)).toHaveLength(7);
  });

  it("widens to the whole ladder for an unrecognized level", () => {
    expect(cohortSeniorities("WIZARD")).toHaveLength(7);
  });
});
