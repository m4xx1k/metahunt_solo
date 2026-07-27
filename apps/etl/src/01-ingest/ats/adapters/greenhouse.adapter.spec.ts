import fixture from "./__fixtures__/greenhouse.appflame.json";
import { greenhouseAdapter, unescapeHtml } from "./greenhouse.adapter";

describe("greenhouseAdapter", () => {
  const items = greenhouseAdapter.toItems(fixture, "appflame");

  it("maps a live board payload", () => {
    expect(items).toHaveLength(fixture.jobs.length);
    expect(items[0].externalId).toMatch(/^\d+$/);
  });

  // Greenhouse is the only board that double-encodes: `content` arrives as
  // `&lt;p&gt;`, so an un-unescaped description reaches the LLM as literal
  // entity text.
  it("unescapes the HTML-escaped content field", () => {
    expect(fixture.jobs[0].content).toContain("&lt;");
    expect(items[0].descriptionHtml).not.toContain("&lt;");
    expect(items[0].descriptionHtml).toContain("<");
  });

  it("does not turn a double-escaped entity into markup", () => {
    expect(unescapeHtml("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
  });

  // The live payload says "Europe; Poland; Ukraine" in a single string. Kept
  // whole, a Ukraine-location filter would never match it.
  it("splits the semicolon-packed location string", () => {
    const [item] = greenhouseAdapter.toItems(
      { jobs: [{ id: 1, title: "Engineer", location: { name: "Europe; Poland; Ukraine" } }] },
      "acme",
    );
    expect(item.locations).toEqual(["Europe", "Poland", "Ukraine"]);
  });

  // integration-research.md §3 claims Greenhouse exposes no first-published
  // date. It does, and preferring `updated_at` would re-date a posting on
  // every edit — the exact "date bump" artefact MET-57 is investigating.
  it("prefers first_published over updated_at", () => {
    const [item] = greenhouseAdapter.toItems(
      {
        jobs: [
          {
            id: 1,
            title: "Engineer",
            first_published: "2026-01-05T10:00:00Z",
            updated_at: "2026-07-20T10:00:00Z",
          },
        ],
      },
      "acme",
    );
    expect(item.publishedAt?.toISOString()).toBe("2026-01-05T10:00:00.000Z");
  });

  it("infers remote from the location text, since the payload has no flag", () => {
    const [remote] = greenhouseAdapter.toItems(
      { jobs: [{ id: 1, title: "Engineer", location: { name: "Remote, Europe" } }] },
      "acme",
    );
    const [unknown] = greenhouseAdapter.toItems(
      { jobs: [{ id: 2, title: "Engineer", location: { name: "Kyiv" } }] },
      "acme",
    );
    expect(remote.isRemote).toBe(true);
    // Not false — the board genuinely did not say.
    expect(unknown.isRemote).toBeNull();
  });

  it("never claims a structured salary", () => {
    expect(items.every((i) => i.salary === null)).toBe(true);
  });
});
