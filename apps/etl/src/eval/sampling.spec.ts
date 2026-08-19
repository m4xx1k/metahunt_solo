import { axisOf, cellsOf, lengthCuts, selectSample, type FeatureRow } from "./sampling";

type RowOverrides = Partial<Omit<FeatureRow, "id">>;

function row(n: number, overrides: RowOverrides = {}): FeatureRow {
  return {
    id: `id-${String(n).padStart(4, "0")}`,
    source: "djinni",
    category: "Java",
    title: "Backend Developer",
    link: null,
    publishedAt: "2026-06-01T00:00:00.000Z",
    len: 3000,
    cyrPct: 60,
    hasSalaryText: false,
    mentionsReservation: false,
    testAssignmentHint: false,
    seniorityInTitle: false,
    prod: { isTech: true, locations: [] },
    ...overrides,
  };
}

/** Pool where every axis has both sides present and one side is rare. */
function mixedPool(size: number): FeatureRow[] {
  return Array.from({ length: size }, (_, i) =>
    row(i, {
      source: i % 3 === 0 ? "dou" : "djinni",
      category: `cat-${i % 40}`,
      len: 200 + i * 37,
      cyrPct: i % 5 === 0 ? 0 : i % 5 === 1 ? 20 : 80,
      hasSalaryText: i % 4 === 0,
      mentionsReservation: i % 25 === 0,
      testAssignmentHint: i % 9 === 0,
      seniorityInTitle: i % 2 === 0,
      prod: i % 50 === 0 ? { _error: "boom" } : { isTech: i % 30 !== 0, locations: [] },
    }),
  );
}

describe("cellsOf", () => {
  const cuts = lengthCuts(mixedPool(200));

  it("emits exactly one cell per axis, so no posting outscores another on term count", () => {
    const plain = cellsOf(row(1), cuts);
    const flagged = cellsOf(
      row(2, { mentionsReservation: true, testAssignmentHint: true, hasSalaryText: true }),
      cuts,
    );
    expect(flagged).toHaveLength(plain.length);
    expect(new Set(plain.map(axisOf))).toEqual(new Set(flagged.map(axisOf)));
  });

  it("emits both sides of a boolean axis", () => {
    expect(cellsOf(row(1, { mentionsReservation: true }), cuts)).toContain("reservation:yes");
    expect(cellsOf(row(1, { mentionsReservation: false }), cuts)).toContain("reservation:no");
  });

  it("separates a failed extraction from a successful one", () => {
    expect(cellsOf(row(1, { prod: { _error: "boom" } }), cuts)).toContain("prod:error");
    expect(cellsOf(row(1, { prod: { isTech: true } }), cuts)).toContain("prod:ok");
    expect(cellsOf(row(1, { prod: null }), cuts)).toContain("prod:missing");
  });

  it("does not read an absent isTech as a tech vacancy", () => {
    // Rows predating the field carry all 14 siblings but no isTech; calling that
    // `true` fabricated the stratum on 20 of the first 25 picks.
    expect(cellsOf(row(1, { prod: { role: "Backend Developer" } }), cuts)).toContain(
      "prod-tech:unknown",
    );
    expect(cellsOf(row(1, { prod: { isTech: true } }), cuts)).toContain("prod-tech:true");
    expect(cellsOf(row(1, { prod: { isTech: false } }), cuts)).toContain("prod-tech:false");
  });

  it("routes a cell to its axis by the first colon, not the last", () => {
    expect(axisOf("category:C++: backend")).toBe("category");
    expect(axisOf("prod-tech:unknown")).toBe("prod-tech");
  });

  it("flags a multi-city posting off the prod locations array", () => {
    const many = {
      isTech: true,
      locations: [
        { city: "Kyiv", country: "Ukraine" },
        { city: "Lviv", country: "Ukraine" },
      ],
    };
    expect(cellsOf(row(1, { prod: many }), cuts)).toContain("multi-city:yes");
    expect(cellsOf(row(1), cuts)).toContain("multi-city:no");
  });
});

describe("selectSample", () => {
  it("is deterministic regardless of input order", () => {
    const pool = mixedPool(300);
    const forward = selectSample(pool, 25).picked.map((p) => p.id);
    const reversed = selectSample([...pool].reverse(), 25).picked.map((p) => p.id);
    expect(reversed).toEqual(forward);
  });

  it("spreads across sources instead of following the category-rich one", () => {
    // Regression guard: Djinni tags ~150 categories and DOU almost none, which made
    // an unweighted objective pick 23 of 25 from Djinni.
    const pool = [
      ...Array.from({ length: 200 }, (_, i) =>
        row(i, { source: "djinni", category: `cat-${i}`, len: 1000 + i }),
      ),
      ...Array.from({ length: 200 }, (_, i) =>
        row(1000 + i, { source: "dou", category: "(none)", len: 1000 + i }),
      ),
    ];
    const bySource = selectSample(pool, 24).picked.filter((p) => p.source === "dou").length;
    expect(bySource).toBeGreaterThanOrEqual(8);
  });

  it("holds every cell at or under its cap when the pool can satisfy them", () => {
    const { picked, coverage, overCapPicks } = selectSample(mixedPool(1000), 25);
    expect(picked).toHaveLength(25);
    expect(overCapPicks).toBe(0);
    const breached = coverage.filter((c) => c.picked > c.cap);
    expect(breached).toEqual([]);
  });

  it("holds the cap on a pool built to breach it", () => {
    // 50 diverse rows against 50 identical clones: the clones' cells saturate at once,
    // and an advisory cap let source:A reach 18 against a cap of 16.
    const pool = [
      ...Array.from({ length: 50 }, (_, i) =>
        row(i, { source: "A", category: `cat-${i}`, len: 500 + i * 100 }),
      ),
      ...Array.from({ length: 50 }, (_, i) => row(1000 + i, { source: "B", category: "same" })),
    ];
    const { coverage } = selectSample(pool, 25);
    const sourceA = coverage.find((c) => c.cell === "source:A")!;
    expect(sourceA.picked).toBeLessThanOrEqual(sourceA.cap);
  });

  it("returns the whole pool when it is smaller than the requested size", () => {
    expect(selectSample(mixedPool(7), 25).picked).toHaveLength(7);
  });

  it("never repeats a posting", () => {
    const ids = selectSample(mixedPool(300), 40).picked.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps explicitly included boundary cases in the deterministic sample", () => {
    const ids = selectSample(mixedPool(300), 25, ["id-0042", "id-0007"]).picked.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["id-0042", "id-0007"]));
    expect(ids).toHaveLength(25);
  });

  it("rejects a forced id outside the source pool", () => {
    expect(() => selectSample(mixedPool(10), 5, ["missing"])).toThrow("not in pool");
  });
});
