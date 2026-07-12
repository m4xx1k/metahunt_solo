import { buildDisclosure } from "./cv-tailor.service";

// Behavior, not copy: the invariant that matters is which deviations demand user
// verification. Every added skill (a claim absent from the CV) must be verify:true;
// reword/drop/reorder are cosmetic and must be verify:false.
describe("buildDisclosure", () => {
  it("emits one verify:true added-skill line per injected skill", () => {
    const out = buildDisclosure({
      rephrased: 0,
      dropped: 0,
      reordered: false,
      addedSkills: ["TypeORM", "DynamoDB"],
    });
    const added = out.filter((d) => d.kind === "added-skill");
    expect(added).toHaveLength(2);
    expect(added.every((d) => d.verify)).toBe(true);
  });

  it("marks reword / drop / reorder as verify:false", () => {
    const out = buildDisclosure({ rephrased: 3, dropped: 2, reordered: true, addedSkills: [] });
    expect(out.map((d) => d.kind).sort()).toEqual(["dropped", "reordered", "reworded"]);
    expect(out.every((d) => !d.verify)).toBe(true);
  });

  it("only added-skill lines ever require verification", () => {
    const out = buildDisclosure({ rephrased: 1, dropped: 1, reordered: true, addedSkills: ["Go"] });
    expect(out.filter((d) => d.verify).every((d) => d.kind === "added-skill")).toBe(true);
  });

  it("omits a section when its input is zero/false", () => {
    expect(
      buildDisclosure({ rephrased: 0, dropped: 0, reordered: false, addedSkills: [] }),
    ).toEqual([]);
  });
});
