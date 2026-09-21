import type { RequirementRef } from "@/lib/api/vacancies";

import { requirementUnits } from "./requirement-units";

const names = (units: RequirementRef[][]) => units.map((u) => u.map((m) => m.name));

describe("requirementUnits", () => {
  it("keeps ungrouped skills as units of one, in order", () => {
    const skills = [
      { id: "a", name: "Go" },
      { id: "b", name: "Kubernetes" },
    ];

    expect(names(requirementUnits(skills))).toEqual([["Go"], ["Kubernetes"]]);
  });

  it("gathers members of one group, however they are interleaved", () => {
    const skills = [
      { id: "a", name: "AWS", group: 1 },
      { id: "b", name: "Terraform" },
      { id: "c", name: "Azure", group: 1 },
    ];

    expect(names(requirementUnits(skills))).toEqual([["AWS", "Azure"], ["Terraform"]]);
  });

  it("keeps two different groups apart", () => {
    const skills = [
      { id: "a", name: "AWS", group: 1 },
      { id: "b", name: "Azure", group: 1 },
      { id: "c", name: "Go", group: 2 },
      { id: "d", name: "Bash", group: 2 },
    ];

    expect(names(requirementUnits(skills))).toEqual([
      ["AWS", "Azure"],
      ["Bash", "Go"],
    ]);
  });

  it("orders members by name, so one unit's label is the same on every render", () => {
    const skills = [
      { id: "a", name: "Google Cloud", group: 1 },
      { id: "b", name: "AWS", group: 1 },
      { id: "c", name: "Azure", group: 1 },
    ];

    expect(names(requirementUnits(skills))).toEqual([["AWS", "Azure", "Google Cloud"]]);
  });

  // `group` numbers restart per vacancy and an id is never a small integer, so
  // the two key spaces cannot collide — but the prefix is what guarantees it.
  it("never lets a group number collide with a node id", () => {
    const skills = [
      { id: "1", name: "Ungrouped" },
      { id: "x", name: "Grouped", group: 1 },
    ];

    expect(names(requirementUnits(skills))).toEqual([["Ungrouped"], ["Grouped"]]);
  });
});
