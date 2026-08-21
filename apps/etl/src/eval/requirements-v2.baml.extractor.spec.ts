jest.mock("../baml_client", () => ({
  __esModule: true,
  b: { ExtractVacancyRequirementsV2: jest.fn() },
  RequirementPriority: { MUST: "MUST", NICE: "NICE" },
}));

import { b } from "../baml_client";

import { BamlRequirementsV2Extractor } from "./requirements-v2.baml.extractor";

const extractRequirements = b.ExtractVacancyRequirementsV2 as unknown as jest.Mock;

function buildDbMock(rows: Array<{ type: string; name: string }>) {
  const where = jest.fn().mockResolvedValue(rows);
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });
  return { select };
}

describe("BamlRequirementsV2Extractor", () => {
  it("uses the isolated BAML function and maps its contract to lowercase evaluator priorities", async () => {
    extractRequirements.mockResolvedValue({
      isTech: true,
      role: "DevOps Engineer",
      seniority: "SENIOR",
      requirements: [
        { priority: "MUST", anyOf: ["AWS", "GCP"] },
        { priority: "NICE", value: "Terraform" },
      ],
    });
    const extractor = new BamlRequirementsV2Extractor(
      buildDbMock([
        { type: "ROLE", name: "DevOps Engineer" },
        { type: "DOMAIN", name: "Fintech" },
        { type: "SKILL", name: "AWS" },
        { type: "SKILL", name: "Terraform" },
      ]) as never,
    );

    const result = await extractor.extract("Senior DevOps: AWS or GCP. Terraform is a plus.");

    expect(extractRequirements).toHaveBeenCalledWith(
      "Senior DevOps: AWS or GCP. Terraform is a plus.",
      "DevOps Engineer",
      "AWS, Terraform",
      expect.objectContaining({ collector: expect.anything() }),
    );
    expect(result.meta.error).toBeUndefined();
    expect(result.data).toMatchObject({
      isTech: true,
      role: "DevOps Engineer",
      seniority: "SENIOR",
      requirements: [
        { priority: "must", anyOf: ["AWS", "GCP"] },
        { priority: "nice", value: "Terraform" },
      ],
    });
  });
});
