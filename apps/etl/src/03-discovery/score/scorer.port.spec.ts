import type { DrizzleDB } from "@metahunt/database";

import { overlayFor } from "./scorer.port";

function fakeDb(rows: unknown[]): DrizzleDB {
  return { execute: jest.fn().mockResolvedValue({ rows }) } as unknown as DrizzleDB;
}

describe("overlayFor", () => {
  it("returns an empty map without querying when there is no candidate", async () => {
    const db = fakeDb([]);

    const overlay = await overlayFor(db, [], ["pos-1"]);

    expect(overlay.size).toBe(0);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("returns an empty map without querying when there are no positions to score", async () => {
    const db = fakeDb([]);

    const overlay = await overlayFor(db, ["node-1"], []);

    expect(overlay.size).toBe(0);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("projects a scored row into a MatchOverlay, keyed by position id", async () => {
    const db = fakeDb([
      { id: "pos-1", relevance: 1.5, coverage: 0.5, tier_bucket: 1, on_stack: true },
    ]);

    const overlay = await overlayFor(db, ["node-1"], ["pos-1"]);

    expect(overlay.get("pos-1")).toEqual({
      relevance: 1.5,
      coverage: 0.5,
      tier: "GOOD",
      percent: 50,
      onStack: true,
    });
  });

  it("coalesces a NULL relevance (zero overlap) to 0 rather than propagating NULL", async () => {
    const db = fakeDb([
      { id: "pos-1", relevance: null, coverage: 0, tier_bucket: 0, on_stack: true },
    ]);

    const overlay = await overlayFor(db, ["node-1"], ["pos-1"]);

    expect(overlay.get("pos-1")).toMatchObject({ relevance: 0, tier: "STRETCH", percent: 0 });
  });

  it("has no entry for a requested position that scored no row", async () => {
    const db = fakeDb([]);

    const overlay = await overlayFor(db, ["node-1"], ["pos-1"]);

    expect(overlay.has("pos-1")).toBe(false);
  });
});
