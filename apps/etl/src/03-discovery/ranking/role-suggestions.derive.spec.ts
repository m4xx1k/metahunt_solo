import {
  deriveRoleSuggestions,
  roleSuggestScore,
  type RoleAggRow,
} from "./role-suggestions.derive";

const row = (over: Partial<RoleAggRow> & { roleId: string }): RoleAggRow => ({
  slug: over.roleId,
  name: over.roleId,
  goodCount: 0,
  totalCount: 0,
  avgCoverage: 0,
  ...over,
});

describe("roleSuggestScore", () => {
  it("smooths so a tiny perfect role does not beat a large strong one", () => {
    // 3/3 → 4/7 ≈ 0.57 vs 120/300 → 121/304 ≈ 0.40 — small still wins on rate,
    // but far less than the raw 1.0 vs 0.4 gap; the floor removes the 3/3 case anyway.
    expect(roleSuggestScore(3, 3)).toBeCloseTo(4 / 7);
    expect(roleSuggestScore(120, 300)).toBeCloseTo(121 / 304);
    expect(roleSuggestScore(0, 10)).toBeCloseTo(1 / 14);
  });
});

describe("deriveRoleSuggestions", () => {
  it("drops roles below the vacancy floor and ranks the rest by score", () => {
    const rows = [
      row({ roleId: "tiny", goodCount: 5, totalCount: 5 }),
      row({ roleId: "backend", goodCount: 124, totalCount: 310 }),
      row({ roleId: "fullstack", goodCount: 30, totalCount: 50 }),
    ];
    const res = deriveRoleSuggestions(rows, null);
    expect(res.reduced).toBe(false);
    expect(res.items.map((i) => i.roleId)).toEqual(["fullstack", "backend"]);
    expect(res.items[0]).toMatchObject({ goodCount: 30, totalCount: 50 });
  });

  it("caps at top-5 and breaks exact score ties by total desc", () => {
    const rows = [
      ...["a", "b", "c", "d", "e", "f"].map((id, i) =>
        row({ roleId: id, goodCount: 60 - i * 5, totalCount: 100 }),
      ),
      // identical smoothed score to "a" (122/208 = 61/104) but twice the volume — wins the tie.
      row({ roleId: "bigger-twin", goodCount: 121, totalCount: 204 }),
    ];
    const res = deriveRoleSuggestions(rows, null);
    expect(res.items).toHaveLength(5);
    expect(res.items.map((i) => i.roleId).slice(0, 2)).toEqual(["bigger-twin", "a"]);
  });

  it("excludes roles below the raw-share floor without flipping to reduced", () => {
    const rows = [
      row({ roleId: "backend", goodCount: 30, totalCount: 50 }),
      // raw 0/10 = 0 < 0.05 even though the smoothed score (1/14 ≈ 0.071) would
      // pass — the floor must test the raw share or it is dead code at total>=10.
      row({ roleId: "not-yours", goodCount: 0, totalCount: 10 }),
    ];
    const res = deriveRoleSuggestions(rows, null);
    expect(res.reduced).toBe(false);
    expect(res.items.map((i) => i.roleId)).toEqual(["backend"]);
  });

  it("pins the CV's declared role first regardless of score", () => {
    const rows = [
      row({ roleId: "backend", goodCount: 100, totalCount: 200 }),
      row({ roleId: "declared", goodCount: 20, totalCount: 200 }),
    ];
    const res = deriveRoleSuggestions(rows, "declared");
    expect(res.items.map((i) => i.roleId)).toEqual(["declared", "backend"]);
    expect(res.items[0].score).toBeCloseTo(21 / 204); // honest score, not inflated by pinning
  });

  it("never pins a role below the vacancy floor", () => {
    const rows = [
      row({ roleId: "backend", goodCount: 100, totalCount: 200 }),
      row({ roleId: "declared", goodCount: 5, totalCount: 5 }),
    ];
    const res = deriveRoleSuggestions(rows, "declared");
    expect(res.items.map((i) => i.roleId)).toEqual(["backend"]);
  });

  it("falls back to avg coverage (reduced) when no role clears the score floor", () => {
    const rows = [
      row({ roleId: "far", goodCount: 0, totalCount: 100, avgCoverage: 0.1 }),
      row({ roleId: "near", goodCount: 0, totalCount: 100, avgCoverage: 0.3 }),
    ];
    const res = deriveRoleSuggestions(rows, null);
    expect(res.reduced).toBe(true);
    expect(res.items.map((i) => i.roleId)).toEqual(["near", "far"]);
  });

  it("returns an empty reduced result when nothing clears the floor", () => {
    expect(deriveRoleSuggestions([row({ roleId: "tiny", totalCount: 9 })], null)).toEqual({
      reduced: true,
      items: [],
    });
  });
});
