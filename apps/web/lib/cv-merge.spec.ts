import { mergeCvs } from "@/lib/cv-merge";
import type { MeCv } from "@/lib/api/me";
import type { SavedCv } from "@/lib/hooks/use-saved";

const serverCv = (over: Partial<MeCv>): MeCv => ({
  id: "u1",
  candidateId: "c1",
  label: "server",
  isActive: false,
  role: null,
  seniority: null,
  experienceYears: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const localCv = (over: Partial<SavedCv>): SavedCv => ({
  candidateId: "c1",
  label: "local",
  addedAt: 0,
  ...over,
});

describe("mergeCvs", () => {
  it("keeps one entry per candidateId with the local copy winning a dup", () => {
    const server = [serverCv({ candidateId: "c1", label: "from-server" })];
    const local = [localCv({ candidateId: "c1", label: "from-local", addedAt: 5 })];

    const merged = mergeCvs(server, local);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({ candidateId: "c1", label: "from-local", addedAt: 5 });
  });

  // The bridge: a CV uploaded seconds ago is not on the server list yet.
  it("keeps a local-only CV the server has not caught up with", () => {
    const server = [serverCv({ candidateId: "s-only" })];
    const local = [localCv({ candidateId: "l-only", addedAt: 1_000 })];

    const ids = mergeCvs(server, local, 10_000)
      .map((c) => c.candidateId)
      .sort();

    expect(ids).toEqual(["l-only", "s-only"]);
  });

  // Past the window it belongs to no account, so nothing can activate it —
  // offering it in the switcher made a row that silently ignored clicks.
  it("drops a stale local-only CV once the server list has loaded", () => {
    const server = [serverCv({ candidateId: "s-only" })];
    const local = [localCv({ candidateId: "l-only", addedAt: 0 })];

    const ids = mergeCvs(server, local, 10 * 60_000).map((c) => c.candidateId);

    expect(ids).toEqual(["s-only"]);
  });

  it("orders newest first by addedAt (server createdAt → epoch ms)", () => {
    const server = [serverCv({ candidateId: "old", createdAt: "2026-01-01T00:00:00.000Z" })];
    const local = [localCv({ candidateId: "new", addedAt: Date.parse("2026-06-01") })];

    expect(
      mergeCvs(server, local, Date.parse("2026-06-01") + 1_000).map((c) => c.candidateId),
    ).toEqual(["new", "old"]);
  });

  it("returns just the local list when the user is logged out (no server data)", () => {
    const local = [localCv({ candidateId: "l1" }), localCv({ candidateId: "l2" })];

    expect(
      mergeCvs(undefined, local)
        .map((c) => c.candidateId)
        .sort(),
    ).toEqual(["l1", "l2"]);
  });
});
