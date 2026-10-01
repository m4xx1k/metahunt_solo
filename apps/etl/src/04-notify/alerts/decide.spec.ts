import { decide, versionOf, type DecideInput, type LedgerEntry } from "./decide";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const HOUR = 3_600_000;
const ago = (hours: number): Date => new Date(NOW.getTime() - hours * HOUR);

const DJINNI = "source-djinni";
const DOU = "source-dou";
const BUMPS_ON = [{ id: "sub-1", alertsBumps: true }];

function entry(over: Partial<LedgerEntry> & Pick<LedgerEntry, "vacancyId">): LedgerEntry {
  return {
    sourceId: DJINNI,
    versionAt: ago(48),
    notifiedAt: ago(48),
    kind: "new",
    ...over,
  };
}

function input(over: Partial<DecideInput> & { versionAt?: Date; sourceId?: string } = {}) {
  const { versionAt, sourceId, ...rest } = over;
  return {
    candidate: {
      vacancyId: "posting-a",
      positionId: "position-1",
      sourceId: sourceId ?? DJINNI,
      versionAt: versionAt ?? ago(1),
    },
    row: null,
    siblings: [],
    subscriptions: BUMPS_ON,
    now: NOW,
    ...rest,
  } satisfies DecideInput;
}

describe("versionOf", () => {
  const loaded = ago(100);
  const observed = ago(2);

  it("is the source's publish date", () => {
    expect(versionOf(ago(5), loaded, observed)).toEqual(ago(5));
  });

  it("falls back to the load time when the date is null", () => {
    expect(versionOf(null, loaded, observed)).toEqual(loaded);
  });

  // Clamped to the record's own observation time, not now(): a future date
  // must give the same version on every run, or it would read as a fresh bump.
  it("clamps a date in the future to when the record was observed", () => {
    const future = new Date(NOW.getTime() + 30 * 24 * HOUR);
    expect(versionOf(future, loaded, observed)).toEqual(observed);
    expect(versionOf(future, loaded, observed)).toEqual(versionOf(future, loaded, observed));
  });
});

describe("decide", () => {
  it("first appearance → new", () => {
    expect(decide(input())).toEqual({ action: "send", kind: "new" });
  });

  it("bump of a posting sent days ago → bumped", () => {
    const row = entry({
      vacancyId: "posting-a",
      versionAt: ago(15 * 24),
      notifiedAt: ago(15 * 24),
    });
    expect(decide(input({ row, versionAt: ago(1) }))).toEqual({ action: "send", kind: "bumped" });
  });

  it("two bumps in a row → the second is absorbed while the first is fresh", () => {
    const afterFirstBump = entry({ vacancyId: "posting-a", versionAt: ago(3), notifiedAt: ago(3) });
    expect(decide(input({ row: afterFirstBump, versionAt: ago(1) }))).toEqual({
      action: "record",
      kind: "absorbed",
    });
  });

  it("re-emit with the same date → skip", () => {
    const row = entry({ vacancyId: "posting-a", versionAt: ago(1) });
    expect(decide(input({ row, versionAt: ago(1) }))).toEqual({ action: "skip", reason: "seen" });
  });

  it("date moved backwards → skip", () => {
    const row = entry({ vacancyId: "posting-a", versionAt: ago(1) });
    expect(decide(input({ row, versionAt: ago(30) }))).toEqual({ action: "skip", reason: "seen" });
  });

  it("DOU edit < 24h after a send → absorbed", () => {
    const row = entry({
      vacancyId: "posting-a",
      sourceId: DOU,
      versionAt: ago(10),
      notifiedAt: ago(9),
    });
    expect(decide(input({ row, sourceId: DOU, versionAt: ago(1) }))).toEqual({
      action: "record",
      kind: "absorbed",
    });
  });

  it("cross-site copy of a sent posting → collapsed", () => {
    const sibling = entry({ vacancyId: "posting-b", sourceId: DOU, notifiedAt: ago(200) });
    expect(decide(input({ siblings: [sibling] }))).toEqual({ action: "record", kind: "collapsed" });
  });

  it("a collapsed sibling does not count as notified", () => {
    const sibling = entry({
      vacancyId: "posting-b",
      sourceId: DOU,
      notifiedAt: null,
      kind: "collapsed",
    });
    expect(decide(input({ siblings: [sibling] }))).toEqual({ action: "send", kind: "new" });
  });

  describe("sibling bump (posting already sent, its cross-site copy was sent too)", () => {
    const row = entry({
      vacancyId: "posting-a",
      versionAt: ago(30 * 24),
      notifiedAt: ago(30 * 24),
    });

    it("sibling notified 1 day ago → collapsed", () => {
      const sibling = entry({ vacancyId: "posting-b", sourceId: DOU, notifiedAt: ago(24) });
      expect(decide(input({ row, siblings: [sibling] }))).toEqual({
        action: "record",
        kind: "collapsed",
      });
    });

    it("sibling notified 5 days ago → bumped", () => {
      const sibling = entry({ vacancyId: "posting-b", sourceId: DOU, notifiedAt: ago(5 * 24) });
      expect(decide(input({ row, siblings: [sibling] }))).toEqual({
        action: "send",
        kind: "bumped",
      });
    });
  });

  describe("same-board re-post (R3b)", () => {
    it("original notified < 24h ago → absorbed", () => {
      const original = entry({ vacancyId: "posting-b", notifiedAt: ago(5) });
      expect(decide(input({ siblings: [original] }))).toEqual({
        action: "record",
        kind: "absorbed",
      });
    });

    it("original notified > 24h ago → bumped", () => {
      const original = entry({ vacancyId: "posting-b", notifiedAt: ago(40) });
      expect(decide(input({ siblings: [original] }))).toEqual({ action: "send", kind: "bumped" });
    });

    it("bumps off → skip, nothing recorded", () => {
      const original = entry({ vacancyId: "posting-b", notifiedAt: ago(40) });
      expect(
        decide(input({ siblings: [original], subscriptions: [{ id: "s", alertsBumps: false }] })),
      ).toEqual({ action: "skip", reason: "bumps_off" });
    });
  });

  it("bumps off → a bump is skipped", () => {
    const row = entry({ vacancyId: "posting-a" });
    expect(decide(input({ row, subscriptions: [{ id: "sub-1", alertsBumps: false }] }))).toEqual({
      action: "skip",
      reason: "bumps_off",
    });
  });

  it("bumps off never blocks a new posting", () => {
    expect(decide(input({ subscriptions: [{ id: "sub-1", alertsBumps: false }] }))).toEqual({
      action: "send",
      kind: "new",
    });
  });

  it("two subscriptions, one with bumps off → the bump is sent", () => {
    const row = entry({ vacancyId: "posting-a" });
    const subscriptions = [
      { id: "sub-1", alertsBumps: false },
      { id: "sub-2", alertsBumps: true },
    ];
    expect(decide(input({ row, subscriptions }))).toEqual({ action: "send", kind: "bumped" });
  });

  it("two subscriptions in one chat → one decision per posting, the second sees the first", () => {
    const subscriptions = [
      { id: "sub-1", alertsBumps: true },
      { id: "sub-2", alertsBumps: true },
    ];
    const first = decide(input({ subscriptions }));
    expect(first).toEqual({ action: "send", kind: "new" });
    const afterClaim = entry({ vacancyId: "posting-a", versionAt: ago(1), notifiedAt: NOW });
    expect(decide(input({ row: afterClaim, subscriptions }))).toEqual({
      action: "skip",
      reason: "seen",
    });
  });

  it("a posting split out of its position after a send → its own row still says seen", () => {
    const row = entry({ vacancyId: "posting-a", versionAt: ago(1), notifiedAt: ago(1) });
    expect(decide(input({ row, siblings: [] }))).toEqual({ action: "skip", reason: "seen" });
  });

  it("a posting merged into a notified position after a send → its own row still says seen", () => {
    const row = entry({ vacancyId: "posting-a", versionAt: ago(1), notifiedAt: ago(1) });
    const newSibling = entry({ vacancyId: "posting-b", sourceId: DOU, notifiedAt: ago(2) });
    expect(decide(input({ row, siblings: [newSibling] }))).toEqual({
      action: "skip",
      reason: "seen",
    });
  });

  it("ignores its own row if it shows up among the siblings", () => {
    const self = entry({ vacancyId: "posting-a", sourceId: DOU, notifiedAt: ago(2) });
    expect(decide(input({ siblings: [self] }))).toEqual({ action: "send", kind: "new" });
  });
});
