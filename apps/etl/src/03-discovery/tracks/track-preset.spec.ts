import {
  presetMatchesNothing,
  resolveTrackPreset,
  type TrackNodeIds,
} from "./track-preset";

const empty = { roleIds: [], skillIds: [] };

describe("resolveTrackPreset (per-axis override-else-inherit)", () => {
  it("uses the track's own nodes when it has them on both axes", () => {
    const input: TrackNodeIds = {
      own: { roleIds: ["r1"], skillIds: ["s1"] },
      parent: { roleIds: ["pr"], skillIds: ["ps"] },
    };
    expect(resolveTrackPreset(input)).toEqual({
      roleIds: ["r1"],
      skillIds: ["s1"],
    });
  });

  it("inherits a parent axis the track leaves empty (stack child)", () => {
    // backend-go: own SKILL only → inherits backend's ROLE, keeps its own SKILL.
    const input: TrackNodeIds = {
      own: { roleIds: [], skillIds: ["go"] },
      parent: { roleIds: ["backend"], skillIds: ["python"] },
    };
    expect(resolveTrackPreset(input)).toEqual({
      roleIds: ["backend"],
      skillIds: ["go"],
    });
  });

  it("resolves each axis independently", () => {
    const input: TrackNodeIds = {
      own: { roleIds: ["r1"], skillIds: [] },
      parent: { roleIds: [], skillIds: ["ps"] },
    };
    expect(resolveTrackPreset(input)).toEqual({
      roleIds: ["r1"],
      skillIds: ["ps"],
    });
  });

  it("yields empty axes for a pure-grouping track (no own, no parent)", () => {
    expect(resolveTrackPreset({ own: empty, parent: empty })).toEqual(empty);
  });
});

describe("presetMatchesNothing", () => {
  it("is true only when both axes are empty", () => {
    expect(presetMatchesNothing({ roleIds: [], skillIds: [] })).toBe(true);
    expect(presetMatchesNothing({ roleIds: ["r"], skillIds: [] })).toBe(false);
    expect(presetMatchesNothing({ roleIds: [], skillIds: ["s"] })).toBe(false);
  });
});
