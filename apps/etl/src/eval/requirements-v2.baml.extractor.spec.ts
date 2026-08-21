jest.mock("../baml_client", () => ({
  __esModule: true,
  b: { ExtractVacancyRequirementsV2: jest.fn() },
  RequirementPriority: { MUST: "MUST", NICE: "NICE" },
  Seniority: {
    INTERN: "INTERN",
    JUNIOR: "JUNIOR",
    MIDDLE: "MIDDLE",
    SENIOR: "SENIOR",
    LEAD: "LEAD",
    PRINCIPAL: "PRINCIPAL",
    C_LEVEL: "C_LEVEL",
  },
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

    const text = "Title: Senior DevOps Engineer\n\nAWS or GCP. Terraform is a plus.";
    const result = await extractor.extract(text);

    expect(extractRequirements).toHaveBeenCalledWith(
      text,
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

  it.each([
    ["Title: Embedded Hardware Architect\n\n7+ years. Technical leadership.", "PRINCIPAL", null],
    ["Title: Lead Radar System Architect\n\nOwn the radar architecture.", null, "LEAD"],
    ["Title: MLOps Engineer\n\nSenior MLOps Engineer needed. 7+ years.", null, "SENIOR"],
    [
      "Title: Senior AI Engineer\n\nYou will lead the development of applications.",
      "LEAD",
      "SENIOR",
    ],
    ["Title: Middle+/Senior Shopware Developer\n\n3+ years.", "SENIOR", null],
  ])("uses the explicit advertised position level for %s", async (text, modelLevel, expected) => {
    extractRequirements.mockResolvedValue({
      isTech: true,
      role: "HARDWARE_ENGINEER",
      seniority: modelLevel,
      requirements: [],
    });

    const result = await new BamlRequirementsV2Extractor().extract(text);

    expect(result.data?.seniority).toBe(expected);
  });
});
