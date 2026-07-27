import { compareChannels, DIRECT_CHANNEL, resolveChannelSource } from "./channel-source";

describe("resolveChannelSource", () => {
  it("prefers an explicit utm tag over the referrer", () => {
    expect(resolveChannelSource("reddit", "l.threads.com")).toBe("reddit");
  });

  it("falls back to the referrer only when the tag is absent or blank", () => {
    expect(resolveChannelSource(null, "l.threads.com")).toBe("threads");
    expect(resolveChannelSource("  ", "l.threads.com")).toBe("threads");
  });

  it.each([
    ["l.threads.com", "threads"],
    ["threads.net", "threads"],
    ["t.me", "telegram"],
    ["org.telegram.messenger", "telegram"],
    ["oauth.telegram.org", "telegram"],
    ["l.instagram.com", "instagram"],
    ["com.reddit.frontpage", "reddit"],
    ["www.reddit.com", "reddit"],
    ["www.google.com", "search"],
    ["duckduckgo.com", "search"],
    ["www.facebook.com", "facebook"],
    ["github.com", "github"],
  ])("maps %s to %s", (host, channel) => {
    expect(resolveChannelSource(null, host)).toBe(channel);
  });

  it("treats our own hosts as direct — internal navigation is not a channel", () => {
    expect(resolveChannelSource(null, "www.metahunt.app")).toBe(DIRECT_CHANNEL);
    expect(resolveChannelSource(null, "metahunt.app")).toBe(DIRECT_CHANNEL);
    expect(resolveChannelSource(null, "localhost")).toBe(DIRECT_CHANNEL);
  });

  it("is direct when neither signal is present", () => {
    expect(resolveChannelSource(null, null)).toBe(DIRECT_CHANNEL);
    expect(resolveChannelSource("", "")).toBe(DIRECT_CHANNEL);
  });

  it("passes an unknown domain through, so a new channel cannot hide in direct", () => {
    expect(resolveChannelSource(null, "news.ycombinator.com")).toBe("news.ycombinator.com");
  });

  // A suffix rule must not match a lookalike domain that merely ends with the
  // same letters — `notreddit.com` is not Reddit.
  it("matches on host boundaries, not bare string endings", () => {
    expect(resolveChannelSource(null, "notreddit.com")).toBe("notreddit.com");
    expect(resolveChannelSource(null, "fake-metahunt.app")).toBe("fake-metahunt.app");
  });
});

describe("compareChannels", () => {
  const row = (source: string, landed: number, campaign: string | null = null) => ({
    source,
    campaign,
    landed,
  });

  it("orders by volume first", () => {
    expect(
      [row("direct", 1), row("threads", 9)].sort(compareChannels).map((r) => r.source),
    ).toEqual(["threads", "direct"]);
  });

  // `direct` is the residue we could not attribute, so it must not outrank a
  // named channel it merely ties with.
  it("sinks direct below a named channel of equal volume", () => {
    expect([row("direct", 1), row("reddit", 1)].sort(compareChannels).map((r) => r.source)).toEqual(
      ["reddit", "direct"],
    );
  });

  it("falls back to source then campaign for named channels", () => {
    expect(
      [row("threads", 1, "b"), row("threads", 1, "a"), row("dou", 1)]
        .sort(compareChannels)
        .map((r) => `${r.source}/${r.campaign ?? ""}`),
    ).toEqual(["dou/", "threads/a", "threads/b"]);
  });
});
