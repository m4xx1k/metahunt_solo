import { candidatesFromProduction } from "./prepare-review";
import type { Manifest } from "../types";

const manifest: Manifest = {
  generatedAt: "2026-08-19T00:00:00.000Z",
  size: 1,
  poolSize: 1,
  coverage: [],
  entries: [
    {
      id: "posting-1",
      source: "dou",
      category: "QA",
      title: "QA Engineer",
      link: null,
      publishedAt: "2026-08-19T00:00:00.000Z",
      cells: [],
    },
  ],
};

describe("candidatesFromProduction", () => {
  it("shows every extraction field, while retaining valid empty defaults for structured fields", () => {
    const [candidate] = candidatesFromProduction(manifest, {
      "posting-1": { role: "QA Engineer" },
    }).candidates;
    expect(candidate.fields.role).toMatchObject({ value: "QA Engineer", verdict: "prod-differs" });
    expect(candidate.fields.skills.value).toEqual({ required: [], optional: [] });
    expect(candidate.fields.locations.value).toEqual([]);
    expect(Object.keys(candidate.fields)).toHaveLength(15);
  });
});
