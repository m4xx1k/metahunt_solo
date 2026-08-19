import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { goldenSetSchema } from "./golden-set.schema";

describe("role-contract golden set", () => {
  const path = resolve(__dirname, "golden-set.role-contract.v1.json");
  const goldenSet = goldenSetSchema.parse(JSON.parse(readFileSync(path, "utf8")));

  it("is a valid, review-gated v1 dataset", () => {
    expect(goldenSet.contract).toBe("role-contract-v1");
    expect(goldenSet.cases).toHaveLength(16);
    expect(new Set(goldenSet.cases.map((item) => item.id)).size).toBe(goldenSet.cases.length);
    expect(goldenSet.cases.every((item) => item.reviewStatus === "draft")).toBe(true);
  });

  it("covers every approved contract boundary before production cases are added", () => {
    expect(new Set(goldenSet.cases.map((item) => item.slice))).toEqual(
      new Set([
        "lead-discipline",
        "architect",
        "executive",
        "generic-role",
        "data-ai-boundary",
        "qa-boundary",
        "mobile-boundary",
        "is-tech-boundary",
        "discipline-boundary",
      ]),
    );
  });
});
