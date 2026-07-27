import { Currency, Seniority } from "../baml_client";

import { scoreField, scoreRun, type Aliases } from "./scoring";
import type { Extraction } from "./types";

const aliases: Aliases = {
  "SKILL:react.js": "React",
  "SKILL:reactjs": "React",
  "SKILL:node": "Node.js",
  "ROLE:react developer": "Frontend Developer",
};

describe("scoreField", () => {
  it("treats an absent field and an explicit null as the same answer", () => {
    // Rows written before isTech existed simply have no value there; scoring that
    // as a miss would blame the extractor for a field it was never asked for.
    expect(scoreField("seniority", {}, { seniority: null }, aliases)).toBe(1);
    expect(scoreField("seniority", { seniority: null }, {}, aliases)).toBe(1);
    expect(scoreField("seniority", { seniority: Seniority.SENIOR }, {}, aliases)).toBe(0);
  });

  it("scores enums and booleans exactly", () => {
    expect(
      scoreField(
        "seniority",
        { seniority: Seniority.SENIOR },
        { seniority: Seniority.SENIOR },
        aliases,
      ),
    ).toBe(1);
    expect(
      scoreField(
        "seniority",
        { seniority: Seniority.SENIOR },
        { seniority: Seniority.LEAD },
        aliases,
      ),
    ).toBe(0);
    expect(scoreField("isTech", { isTech: true }, { isTech: false }, aliases)).toBe(0);
  });

  it("resolves a role through its alias before comparing", () => {
    const got = scoreField(
      "role",
      { role: "Frontend Developer" },
      { role: "React Developer" },
      aliases,
    );
    expect(got).toBe(1);
  });

  it("does not let a role alias rescue an unrelated role", () => {
    expect(
      scoreField("role", { role: "Frontend Developer" }, { role: "QA Engineer" }, aliases),
    ).toBe(0);
  });

  it("collapses skill spellings through aliases", () => {
    const expected: Extraction = { skills: { required: ["React", "Node.js"], optional: [] } };
    const actual: Extraction = { skills: { required: ["react.js", "node"], optional: [] } };
    expect(scoreField("skills", expected, actual, aliases)).toBe(1);
  });

  it("scores partial skill overlap by F1, not all-or-nothing", () => {
    const expected: Extraction = { skills: { required: ["React", "Node.js"], optional: [] } };
    const actual: Extraction = { skills: { required: ["React", "Vue.js"], optional: [] } };
    // 1 of 2 required hit → F1 0.5; the empty `optional` carries no weight either way.
    expect(scoreField("skills", expected, actual, aliases)).toBe(0.5);
  });

  it("counts two empty skill lists as agreement, and one empty as total miss", () => {
    const empty: Extraction = { skills: { required: [], optional: [] } };
    expect(scoreField("skills", empty, empty, aliases)).toBe(1);
    // 0, not 0.5: averaging the halves gave the usually-empty `optional` a free
    // point and floored every skills score, including a wholly invented list.
    const some: Extraction = { skills: { required: ["Go"], optional: [] } };
    expect(scoreField("skills", empty, some, aliases)).toBe(0);
  });

  it("weights the skills halves by content instead of splitting 50/50", () => {
    const expected: Extraction = { skills: { required: ["Go", "Redis"], optional: ["gRPC"] } };
    const requiredRight: Extraction = { skills: { required: ["Go", "Redis"], optional: [] } };
    const requiredWrong: Extraction = {
      skills: { required: ["PHP", "MySQL"], optional: ["gRPC"] },
    };
    expect(scoreField("skills", expected, requiredRight, aliases)).toBeGreaterThan(
      scoreField("skills", expected, requiredWrong, aliases),
    );
  });

  it("treats an all-null salary object as the same answer as null", () => {
    const spelledOut: Extraction = { salary: { min: null, max: null, currency: null } };
    expect(scoreField("salary", { salary: null }, spelledOut, aliases)).toBe(1);
  });

  it("does not fail a salary on number-vs-string or currency casing", () => {
    const expected: Extraction = { salary: { min: 5000, max: 7000, currency: Currency.USD } };
    const loose = { salary: { min: "5000", max: 7000, currency: "usd" } } as unknown as Extraction;
    expect(scoreField("salary", expected, loose, aliases)).toBe(1);
  });

  it("compares locations as a set of city+country", () => {
    const kyivLviv: Extraction = {
      locations: [
        { city: "Kyiv", country: "Ukraine" },
        { city: "Lviv", country: "Ukraine" },
      ],
    };
    const reordered: Extraction = {
      locations: [
        { city: "lviv", country: "ukraine" },
        { city: "KYIV", country: "Ukraine" },
      ],
    };
    expect(scoreField("locations", kyivLviv, reordered, aliases)).toBe(1);
  });

  it("penalises a collapsed multi-city posting proportionally", () => {
    const both: Extraction = {
      locations: [
        { city: "Kyiv", country: "Ukraine" },
        { city: "Warsaw", country: "Poland" },
      ],
    };
    const one: Extraction = { locations: [{ city: "Kyiv", country: "Ukraine" }] };
    expect(scoreField("locations", both, one, aliases)).toBeCloseTo(0.667, 2);
  });

  it("scores salary per component so a right range with a wrong currency is not a zero", () => {
    const expected: Extraction = { salary: { min: 5000, max: 7000, currency: Currency.USD } };
    const wrongCurrency: Extraction = { salary: { min: 5000, max: 7000, currency: Currency.EUR } };
    expect(scoreField("salary", expected, wrongCurrency, aliases)).toBeCloseTo(0.667, 2);
  });

  it("treats a hallucinated salary as a full miss", () => {
    const invented: Extraction = { salary: { min: 3000, max: 4000, currency: Currency.USD } };
    expect(scoreField("salary", { salary: null }, invented, aliases)).toBe(0);
    expect(scoreField("salary", invented, { salary: null }, aliases)).toBe(0);
  });
});

describe("scoreRun", () => {
  const golden = [
    {
      id: "one",
      values: {
        isTech: true,
        role: "Backend Developer",
        seniority: Seniority.SENIOR,
        skills: { required: ["Go"], optional: [] },
        salary: null,
        hasReservation: true,
      } as Extraction,
    },
    {
      id: "two",
      values: {
        isTech: true,
        role: "QA Engineer",
        seniority: null,
        skills: { required: [], optional: [] },
        salary: null,
      } as Extraction,
    },
  ];

  it("scores a posting the run never produced as a hard zero", () => {
    // Not "less than 1" — an empty-object fallback scored a total crash at 0.87
    // because every null golden field matched, which is the failure this must catch.
    const report = scoreRun(golden, { one: golden[0].values }, aliases);
    const crashed = report.perPosting.find((p) => p.id === "two")!;
    expect(crashed.core).toBe(0);
    expect(crashed.all).toBe(0);
    expect(report.perPosting.find((p) => p.id === "one")!.core).toBe(1);
    expect(report.missing).toBe(1);
  });

  it("reports core separately so long-tail noise cannot mask a core regression", () => {
    const run = {
      one: { ...golden[0].values, role: "Frontend Developer", hasReservation: true },
      two: golden[1].values,
    };
    const report = scoreRun(golden, run, aliases);
    expect(report.core).toBeLessThan(report.all);
  });

  it("gives a perfect score when the run matches the golden values", () => {
    const report = scoreRun(golden, { one: golden[0].values, two: golden[1].values }, aliases);
    expect(report.core).toBe(1);
    expect(report.all).toBe(1);
  });

  it("names the field that regressed", () => {
    const run = { one: { ...golden[0].values, seniority: Seniority.LEAD }, two: golden[1].values };
    const report = scoreRun(golden, run, aliases);
    expect(report.byField.find((f) => f.field === "seniority")!.score).toBe(0.5);
    expect(report.byField.find((f) => f.field === "role")!.score).toBe(1);
  });
});
