import { buildMatchHref } from "./match-draft";

describe("buildMatchHref", () => {
  it("signals open=cv (never a candidateId) in the resulting feed URL", () => {
    const href = buildMatchHref(
      "candidate-1",
      [{ id: "ignored-manual-skill" }],
      new Set(["backend", "full-stack"]),
      [{ id: "php" }],
    );
    const params = new URL(href, "https://metahunt.app").searchParams;

    expect(params.get("open")).toBe("cv");
    expect(params.has("cv")).toBe(false);
    expect(params.has("skills")).toBe(false);
    expect(params.get("roles")).toBe("backend,full-stack");
    expect(params.get("excludeSkills")).toBe("php");
  });

  it("keeps manual skills and exclusions without an open=cv signal", () => {
    const href = buildMatchHref(null, [{ id: "typescript" }, { id: "react" }], new Set(), [
      { id: "php" },
    ]);
    const params = new URL(href, "https://metahunt.app").searchParams;

    expect(params.has("open")).toBe(false);
    expect(params.get("skills")).toBe("typescript,react");
    expect(params.get("excludeSkills")).toBe("php");
  });

  it("omits ?roles when the user picked none, even with a CV", () => {
    const href = buildMatchHref("candidate-1", [], new Set(), []);
    const params = new URL(href, "https://metahunt.app").searchParams;

    expect(params.get("open")).toBe("cv");
    expect(params.has("roles")).toBe(false);
  });
});
