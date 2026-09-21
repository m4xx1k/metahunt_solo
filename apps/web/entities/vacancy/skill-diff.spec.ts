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
      requiredTotal: 2,
    });
  });

  it("returns everything missing, nothing have/bonus, for a viewer with no skills", () => {
    const required1 = { id: "req-1", name: "Go" };
    const skills: VacancySkills = { required: [required1], optional: [] };

    expect(skillDiff(skills, [])).toEqual({
      have: [],
      missing: [required1],
      bonus: [],
      requiredTotal: 1,
    });
  });

  it("returns nothing at all for a vacancy with no listed skills", () => {
    const skills: VacancySkills = { required: [], optional: [] };

    expect(skillDiff(skills, [{ id: "extra-1", name: "Rust" }])).toEqual({
      have: [],
      missing: [],
      bonus: [{ id: "extra-1", name: "Rust" }],
      requiredTotal: 0,
    });
  });

  // R8: the complaint that started the requirement-groups tracker — one choice
  // showing up as three red chips, and counted three times against the Fit.
  it("counts and renders a choice once", () => {
    const go = { id: "req-1", name: "Go" };
    const aws = { id: "req-2", name: "AWS", group: 1 };
    const azure = { id: "req-3", name: "Azure", group: 1 };
    const skills: VacancySkills = { required: [go, aws, azure], optional: [] };

    const satisfied = skillDiff(skills, [go, aws]);
    const unmet = skillDiff(skills, [go]);

    expect(satisfied).toMatchObject({ missing: [], requiredTotal: 2 });
    expect(unmet.missing).toEqual([{ id: "req-2", name: "AWS / Azure" }]);
    expect(unmet.requiredTotal).toBe(2);
  });
});
