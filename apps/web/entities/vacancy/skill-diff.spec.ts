import type { VacancySkills } from "@/lib/api/vacancies";

import { skillDiff } from "./skill-diff";

describe("skillDiff", () => {
  it("splits have/missing/bonus the same way feed.controller.ts's old buildSkillDiff did", () => {
    const required1 = { id: "req-1", name: "Go" }; // viewer has it → have
    const required2 = { id: "req-2", name: "Kubernetes" }; // viewer lacks it → missing
    const optional1 = { id: "opt-1", name: "Docker" }; // viewer has it → have
    const bonusSkill = { id: "bonus-1", name: "Rust" }; // not on the vacancy → bonus
    const skills: VacancySkills = { required: [required1, required2], optional: [optional1] };

    const diff = skillDiff(skills, [required1, optional1, bonusSkill]);

    expect(diff).toEqual({
      have: [required1, optional1],
      missing: [required2],
      bonus: [bonusSkill],
    });
  });

  it("returns everything missing, nothing have/bonus, for a viewer with no skills", () => {
    const required1 = { id: "req-1", name: "Go" };
    const skills: VacancySkills = { required: [required1], optional: [] };

    expect(skillDiff(skills, [])).toEqual({ have: [], missing: [required1], bonus: [] });
  });

  it("returns nothing at all for a vacancy with no listed skills", () => {
    const skills: VacancySkills = { required: [], optional: [] };

    expect(skillDiff(skills, [{ id: "extra-1", name: "Rust" }])).toEqual({
      have: [],
      missing: [],
      bonus: [{ id: "extra-1", name: "Rust" }],
    });
  });
});
