import { findNode, findRole, graph, neighborhood, searchNodes } from "./graph";

// These assert the artifact's own integrity as much as the accessor logic: a
// regenerated export with a broken index mapping would silently render a graph
// of the wrong skills, and nothing else in the stack would catch it.

describe("metalab artifact integrity", () => {
  it("keeps every edge index inside the node array", () => {
    const bad = graph.edges.filter((e) => !graph.nodes[e.a] || !graph.nodes[e.b] || e.a === e.b);
    expect(bad).toEqual([]);
  });

  it("keeps every role edge index inside the node array", () => {
    const bad = graph.roles.flatMap((r) =>
      r.edges.filter((e) => !graph.nodes[e.a] || !graph.nodes[e.b] || e.a === e.b),
    );
    expect(bad).toEqual([]);
  });

  it("honours its own declared support floors", () => {
    expect(graph.nodes.every((n) => n.support >= graph.contract.minSkillSupport)).toBe(true);
    expect(graph.edges.every((e) => e.pairs >= graph.contract.minPairSupport)).toBe(true);
  });

  it("never lets a pair outnumber either skill it is made of", () => {
    const bad = graph.edges.filter(
      (e) => e.pairs > graph.nodes[e.a].support || e.pairs > graph.nodes[e.b].support,
    );
    expect(bad).toEqual([]);
  });

  it("agrees with itself on conditional probabilities", () => {
    for (const e of graph.edges.slice(0, 500)) {
      expect(e.pBgivenA).toBeCloseTo(e.pairs / graph.nodes[e.a].support, 3);
      expect(e.pAgivenB).toBeCloseTo(e.pairs / graph.nodes[e.b].support, 3);
    }
  });

  it("states a contract that forbids a liveness claim", () => {
    expect(graph.contract.livenessClaim).toBe("none");
    expect(graph.contract.grain).toContain("canonical position");
  });
});

describe("findNode / searchNodes", () => {
  it("resolves a skill by slug and by name, case-insensitively", () => {
    const bySlug = findNode("python");
    expect(bySlug?.name).toBe("Python");
    expect(findNode("PYTHON")?.id).toBe(bySlug?.id);
  });

  it("returns null for a skill below the support floor", () => {
    expect(findNode("definitely-not-a-real-skill")).toBeNull();
  });

  it("filters by substring and caps the result", () => {
    const hits = searchNodes("sql", 5);
    expect(hits.length).toBeLessThanOrEqual(5);
    expect(hits.every((n) => n.name.toLowerCase().includes("sql"))).toBe(true);
  });
});

describe("neighborhood", () => {
  const python = findNode("Python")!;

  it("always reports P(neighbour | focus), whichever side the focus was stored on", () => {
    const view = neighborhood(python, { limit: 100 });
    for (const n of view.neighbors) {
      const edge = graph.edges.find(
        (e) =>
          (graph.nodes[e.a].id === python.id && graph.nodes[e.b].id === n.node.id) ||
          (graph.nodes[e.b].id === python.id && graph.nodes[e.a].id === n.node.id),
      )!;
      const focusIsA = graph.nodes[edge.a].id === python.id;
      expect(n.pGiven).toBe(focusIsA ? edge.pBgivenA : edge.pAgivenB);
      expect(n.pairs / view.focusSupport).toBeCloseTo(n.pGiven, 3);
    }
  });

  it("respects the pair floor", () => {
    const view = neighborhood(python, { minPairs: 200, limit: 100 });
    expect(view.neighbors.every((n) => n.pairs >= 200)).toBe(true);
  });

  it("sorts by the requested metric", () => {
    const byPairs = neighborhood(python, { sort: "pairs" }).neighbors.map((n) => n.pairs);
    expect([...byPairs].sort((a, b) => b - a)).toEqual(byPairs);

    const byLift = neighborhood(python, { sort: "lift" }).neighbors.map((n) => n.lift);
    expect([...byLift].sort((a, b) => b - a)).toEqual(byLift);
  });

  it("switches denominator and support when a role is applied", () => {
    const backend = graph.roles.find((r) => r.name === "Backend Engineer")!;
    const global = neighborhood(python);
    const inRole = neighborhood(python, { role: backend });

    expect(global.denominator).toBe(graph.provenance.nPositions);
    expect(inRole.denominator).toBe(backend.positions);
    expect(inRole.focusSupport).toBeLessThanOrEqual(global.focusSupport);
    expect(inRole.scopeLabel).toBe("Backend Engineer");
  });

  it("flags truncation rather than silently hiding neighbours", () => {
    const view = neighborhood(python, { limit: 3 });
    expect(view.neighbors).toHaveLength(3);
    expect(view.truncated).toBe(true);
  });
});

describe("findRole", () => {
  it("returns null for no role and for an unknown id", () => {
    expect(findRole(null)).toBeNull();
    expect(findRole("nope")).toBeNull();
  });

  it("only carries roles above the declared segment floor", () => {
    expect(graph.roles.every((r) => r.positions >= graph.contract.minRolePositions)).toBe(true);
  });
});
