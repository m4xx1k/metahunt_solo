import { stampRequirementGroups } from "./requirement-groups";
import type { SkillLink } from "../repositories/vacancy.repository";

const AWS = "node-aws";
const GCP = "node-gcp";
const KAFKA = "node-kafka";
const RABBIT = "node-rabbit";
const TERRAFORM = "node-terraform";

function links(entries: Array<[string, boolean]>): Map<string, SkillLink> {
  return new Map(entries.map(([nodeId, isRequired]) => [nodeId, { nodeId, isRequired }]));
}

const names = new Map([
  ["aws", AWS],
  ["gcp", GCP],
  ["kafka", KAFKA],
  ["rabbitmq", RABBIT],
  ["terraform", TERRAFORM],
]);

describe("stampRequirementGroups", () => {
  it("stamps one number onto every member of a choice, and leaves the rest null", () => {
    const resolved = links([
      [AWS, true],
      [GCP, true],
      [KAFKA, true],
    ]);

    const result = stampRequirementGroups(resolved, [{ anyOf: ["AWS", "GCP"] }], names);

    expect(result).toEqual({ stamped: 1, drops: [] });
    expect(resolved.get(AWS)?.requirementGroup).toBe(1);
    expect(resolved.get(GCP)?.requirementGroup).toBe(1);
    expect(resolved.get(KAFKA)?.requirementGroup).toBeUndefined();
  });

  it("numbers surviving groups contiguously, so a dropped group leaves no gap", () => {
    const resolved = links([
      [AWS, true],
      [GCP, true],
      [KAFKA, true],
      [RABBIT, true],
    ]);

    const result = stampRequirementGroups(
      resolved,
      [{ anyOf: ["AWS"] }, { anyOf: ["Kafka", "RabbitMQ"] }, { anyOf: ["AWS", "GCP"] }],
      names,
    );

    expect(result.stamped).toBe(2);
    expect(result.drops).toEqual([{ index: 1, reason: "too-few-members" }]);
    expect(resolved.get(KAFKA)?.requirementGroup).toBe(1);
    expect(resolved.get(RABBIT)?.requirementGroup).toBe(1);
    expect(resolved.get(AWS)?.requirementGroup).toBe(2);
    expect(resolved.get(GCP)?.requirementGroup).toBe(2);
  });

  it("matches members by alias-normalized name, never by resolving a node of its own", () => {
    const resolved = links([
      [AWS, true],
      [RABBIT, true],
    ]);

    const result = stampRequirementGroups(resolved, [{ anyOf: ["  aws  ", "Rabbit-MQ"] }], names);

    expect(result.stamped).toBe(1);
    expect(resolved.get(AWS)?.requirementGroup).toBe(1);
    expect(resolved.get(RABBIT)?.requirementGroup).toBe(1);
  });

  it("drops a group naming a skill this vacancy never extracted", () => {
    const resolved = links([[AWS, true]]);

    const result = stampRequirementGroups(resolved, [{ anyOf: ["AWS", "Oracle Cloud"] }], names);

    expect(result.drops).toEqual([{ index: 1, reason: "unknown-member" }]);
    expect(resolved.get(AWS)?.requirementGroup).toBeUndefined();
  });

  it("drops a group whose members collapse to one node after alias dedup", () => {
    const resolved = links([[AWS, true]]);
    const aliased = new Map([...names, ["amazonwebservices", AWS]]);

    const result = stampRequirementGroups(
      resolved,
      [{ anyOf: ["AWS", "Amazon Web Services"] }],
      aliased,
    );

    expect(result.drops).toEqual([{ index: 1, reason: "too-few-members" }]);
    expect(resolved.get(AWS)?.requirementGroup).toBeUndefined();
  });

  it("drops a group that reaches into optional, including an optional-only one", () => {
    const resolved = links([
      [AWS, true],
      [TERRAFORM, false],
      [KAFKA, false],
      [RABBIT, false],
    ]);

    const result = stampRequirementGroups(
      resolved,
      [{ anyOf: ["AWS", "Terraform"] }, { anyOf: ["Kafka", "RabbitMQ"] }],
      names,
    );

    expect(result.stamped).toBe(0);
    expect(result.drops).toEqual([
      { index: 1, reason: "optional-member" },
      { index: 2, reason: "optional-member" },
    ]);
    expect(resolved.get(AWS)?.requirementGroup).toBeUndefined();
    expect(resolved.get(KAFKA)?.requirementGroup).toBeUndefined();
  });

  it("drops the second of two overlapping groups and keeps the first intact", () => {
    const resolved = links([
      [AWS, true],
      [GCP, true],
      [KAFKA, true],
    ]);

    const result = stampRequirementGroups(
      resolved,
      [{ anyOf: ["AWS", "GCP"] }, { anyOf: ["GCP", "Kafka"] }],
      names,
    );

    expect(result.stamped).toBe(1);
    expect(result.drops).toEqual([{ index: 2, reason: "overlapping" }]);
    expect(resolved.get(AWS)?.requirementGroup).toBe(1);
    expect(resolved.get(GCP)?.requirementGroup).toBe(1);
    expect(resolved.get(KAFKA)?.requirementGroup).toBeUndefined();
  });

  it("leaves every link ungrouped when the posting states no choice", () => {
    const resolved = links([
      [AWS, true],
      [TERRAFORM, false],
    ]);

    const result = stampRequirementGroups(resolved, [], names);

    expect(result).toEqual({ stamped: 0, drops: [] });
    expect([...resolved.values()].every((link) => link.requirementGroup === undefined)).toBe(true);
  });
});
