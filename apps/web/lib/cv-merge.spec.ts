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

  it("unions server-only and local-only CVs", () => {
    const server = [serverCv({ candidateId: "s-only" })];
    const local = [localCv({ candidateId: "l-only" })];

    const ids = mergeCvs(server, local).map((c) => c.candidateId).sort();

    expect(ids).toEqual(["l-only", "s-only"]);
  });

  it("orders newest first by addedAt (server createdAt → epoch ms)", () => {
    const server = [
      serverCv({ candidateId: "old", createdAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const local = [localCv({ candidateId: "new", addedAt: Date.parse("2026-06-01") })];

    expect(mergeCvs(server, local).map((c) => c.candidateId)).toEqual(["new", "old"]);
  });

  it("returns just the local list when the user is logged out (no server data)", () => {
    const local = [localCv({ candidateId: "l1" }), localCv({ candidateId: "l2" })];

    expect(mergeCvs(undefined, local).map((c) => c.candidateId).sort()).toEqual(["l1", "l2"]);
  });
});
