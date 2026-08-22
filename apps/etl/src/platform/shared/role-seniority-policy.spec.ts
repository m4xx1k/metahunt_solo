import { applyRoleSeniorityPolicy, rolesCompatible, titleSeniority } from "./role-seniority-policy";

const known = [
  "Backend Developer",
  "Data Engineer",
  "QA Engineer",
  "Manual QA Engineer",
  "Automation QA Engineer",
  "Mobile Developer",
  "Android Engineer",
  "iOS Engineer",
  "Cross-platform Mobile Engineer",
  "Software Architect",
  "Solutions Architect",
  "Software Engineer",
];

describe("role/seniority title policy", () => {
  it("keeps discipline while making a lead an explicit level", () => {
    expect(
      applyRoleSeniorityPolicy({
        text: "Title: Lead Data Engineer (Architect)",
        role: "Data Engineer",
        seniority: "PRINCIPAL",
        experienceYears: 8,
        knownRoles: known,
      }),
    ).toEqual({ role: "Data Engineer", seniority: "LEAD" });
  });
  it("does not turn architect into a level", () => {
    expect(titleSeniority("Data Architect", null)).toBeNull();
  });
  it("uses the lower advertised level for a range", () => {
    expect(titleSeniority("Senior / Principal ML Engineer", null)).toBe("SENIOR");
  });
  it("gives C-level precedence over tech lead", () => {
    expect(titleSeniority("CTO / Tech Lead", null)).toBe("C_LEVEL");
  });
  it("maps QA and mobile variants deterministically", () => {
    expect(
      applyRoleSeniorityPolicy({
        text: "Title: Manual QA Engineer",
        role: "QA Engineer",
        seniority: null,
        experienceYears: 3,
        knownRoles: known,
      }).role,
    ).toBe("Manual QA Engineer");
    expect(
      applyRoleSeniorityPolicy({
        text: "Title: Flutter developer",
        role: "Mobile Developer",
        seniority: null,
        experienceYears: 3,
        knownRoles: known,
      }).role,
    ).toBe("Cross-platform Mobile Engineer");
  });
  it("keeps parent/child role compatibility but rejects siblings", () => {
    expect(rolesCompatible("QA Engineer", "Manual QA Engineer")).toBe(true);
    expect(rolesCompatible("Manual QA Engineer", "Automation QA Engineer")).toBe(false);
  });
});
