jest.mock("../baml_client", () => ({
  __esModule: true,
  b: { ExtractVacancyRequirementsV2: jest.fn() },
  RequirementPriority: { MUST: "MUST", NICE: "NICE" },
}));

import { b } from "../baml_client";

import { BamlRequirementsV2Extractor } from "./requirements-v2.baml.extractor";

const extractRequirements = b.ExtractVacancyRequirementsV2 as unknown as jest.Mock;

describe("BamlRequirementsV2Extractor", () => {
  it("uses the isolated BAML function and maps its contract to lowercase evaluator priorities", async () => {
    extractRequirements.mockResolvedValue({
      isTech: true,
      role: "DEVOPS_ENGINEER",
      seniority: "SENIOR",
      requirements: [
        { priority: "MUST", anyOf: ["AWS", "GCP"] },
        { priority: "NICE", value: "Terraform" },
      ],
    });
    const extractor = new BamlRequirementsV2Extractor();

    const result = await extractor.extract("Senior DevOps: AWS or GCP. Terraform is a plus.");

    expect(extractRequirements).toHaveBeenCalledWith(
      "Senior DevOps: AWS or GCP. Terraform is a plus.",
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
