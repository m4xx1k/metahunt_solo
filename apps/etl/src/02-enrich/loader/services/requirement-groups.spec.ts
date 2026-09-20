import { assignRequirementGroups } from "./requirement-groups";

const AWS = "node-aws";
const GCP = "node-gcp";
const KAFKA = "node-kafka";
const RABBIT = "node-rabbit";

describe("assignRequirementGroups", () => {
  it("numbers a choice and leaves single-skill requirements ungrouped", () => {
    const result = assignRequirementGroups([[AWS, GCP], [KAFKA]]);

    expect(result.drops).toEqual([]);
    expect(result.groupByNode.get(AWS)).toBe(1);
    expect(result.groupByNode.get(GCP)).toBe(1);
    expect(result.groupByNode.has(KAFKA)).toBe(false);
  });

  it("numbers choices contiguously across the requirements between them", () => {
    const result = assignRequirementGroups([[AWS], [KAFKA, RABBIT], [AWS, GCP]]);

    expect(result.groupByNode.get(KAFKA)).toBe(1);
    expect(result.groupByNode.get(RABBIT)).toBe(1);
    expect(result.groupByNode.get(AWS)).toBe(2);
    expect(result.groupByNode.get(GCP)).toBe(2);
  });

  it("leaves a choice whose members alias onto one node flat, without a drop", () => {
    const result = assignRequirementGroups([[AWS, AWS]]);

    expect(result.drops).toEqual([]);
    expect(result.groupByNode.size).toBe(0);
  });

  it("drops the second of two overlapping choices and keeps the first intact", () => {
    const result = assignRequirementGroups([
      [AWS, GCP],
      [GCP, KAFKA],
    ]);

    expect(result.drops).toEqual([{ index: 2, reason: "overlapping" }]);
    expect(result.groupByNode.get(AWS)).toBe(1);
    expect(result.groupByNode.get(GCP)).toBe(1);
    expect(result.groupByNode.has(KAFKA)).toBe(false);
  });

  it("groups nothing when the posting states no choice", () => {
    const result = assignRequirementGroups([[AWS], [KAFKA]]);

    expect(result).toEqual({ groupByNode: new Map(), drops: [] });
  });
});
