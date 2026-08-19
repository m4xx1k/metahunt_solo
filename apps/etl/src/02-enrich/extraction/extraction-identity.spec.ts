import { buildVacancyExtractionSpecHash, hashVerifiedTaxonomy } from "./extraction-identity";

describe("vacancy extraction identity", () => {
  it("preserves the exact cache spec-hash recipe", () => {
    expect(
      buildVacancyExtractionSpecHash({
        bamlSourceHash: "source",
        bamlVersion: "0.222.0",
        provider: "openai-generic",
        model: "deepseek-v4-flash",
        taxonomyHash: "taxonomy",
      }),
    ).toBe("613fc21efc2ddc5e001770d4dec2e6b8dcbf56889fbb06de57578c2c1935863f");
  });

  it("hashes the taxonomy independent of node-type query ordering", () => {
    expect(
      hashVerifiedTaxonomy(["Backend Engineer, Data Engineer", "Fintech", "React, TypeScript"]),
    ).toBe(
      hashVerifiedTaxonomy(["TypeScript, React", "Fintech", "Data Engineer, Backend Engineer"]),
    );
  });
});
