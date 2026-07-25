import { parseReleases, renderInline } from "./releases";

describe("renderInline", () => {
  it("escapes HTML before adding any of its own", () => {
    expect(renderInline("a <script>alert(1)</script> b")).not.toContain("<script>");
    expect(renderInline('quote " and & amp')).toBe("quote &quot; and &amp; amp");
  });

  it("renders bold, italics and code", () => {
    expect(renderInline("**Ship it**")).toBe("<strong>Ship it</strong>");
    expect(renderInline("`feat/x`")).toBe("<code>feat/x</code>");
    expect(renderInline("plain *emphasis* here")).toBe("plain <em>emphasis</em> here");
  });

  it("keeps external links but marks them nofollow", () => {
    const out = renderInline("see [PR #93](https://github.com/m4xx1k/metahunt_solo/pull/93)");
    expect(out).toContain('href="https://github.com/m4xx1k/metahunt_solo/pull/93"');
    expect(out).toContain('rel="nofollow noopener"');
    expect(out).toContain("PR #93");
  });

  it("drops the href on repo-relative links, keeping the text", () => {
    // ./migrations/*.md is not published — linking it would ship a broken link.
    const out = renderInline("→ [tracker](./migrations/_done/operator-console.md)");
    expect(out).toBe("→ tracker");
    expect(renderInline("[runbook](../runbook/account-deletion.md)")).toBe("runbook");
  });
});

describe("parseReleases", () => {
  const SAMPLE = `# Releases / journal

Preamble that must not become an entry.

---

## 2026-05-03 (frontend import)

- **Older thing** (\`feat/old\`). Body of the older thing.

---

## 2026-07-24

- **Newest thing** (\`feat/new\`). Body one.
  Wrapped continuation of body one.
- **Second thing**. Body two.
  - a nested detail
  - another nested detail
- A bullet with no bold lead at all.

---

## 2026-05-09

- **May ninth** (\`feat/may\`). Body.
`;

  it("groups entries under their date heading", () => {
    const days = parseReleases(SAMPLE);
    expect(days.map((d) => d.date)).toEqual(["2026-07-24", "2026-05-09", "2026-05-03"]);
  });

  it("sorts newest first even though the source file does not", () => {
    // The real journal leads with July, jumps back to April, and has 05-11
    // before 05-09.
    const dates = parseReleases(SAMPLE).map((d) => d.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("keeps the heading's trailing note", () => {
    const may3 = parseReleases(SAMPLE).find((d) => d.date === "2026-05-03")!;
    expect(may3.note).toBe("(frontend import)");
    expect(parseReleases(SAMPLE)[0].note).toBeNull();
  });

  it("splits the bold lead into the title and the rest into the body", () => {
    const [newest] = parseReleases(SAMPLE);
    expect(newest.entries[0].title).toBe("Newest thing");
    expect(newest.entries[0].body).toContain("Body one.");
  });

  it("inline-renders the title, so markdown inside it does not leak", () => {
    // Real entry: "**`/match` onboarding landing**" — rendered as plain text this
    // showed literal backticks in the summary.
    const [day] = parseReleases("## 2026-07-24\n\n- **`/match` onboarding landing**. Body.\n");
    expect(day.entries[0].title).toBe("<code>/match</code> onboarding landing");
  });

  it("folds wrapped prose and nested bullets into the parent entry", () => {
    const [newest] = parseReleases(SAMPLE);
    expect(newest.entries[0].body).toContain("Wrapped continuation");
    expect(newest.entries[1].body).toContain("a nested detail");
    expect(newest.entries[1].body).toContain("another nested detail");
  });

  it("handles a bullet with no bold lead by using the whole line as the title", () => {
    const [newest] = parseReleases(SAMPLE);
    const bare = newest.entries[2];
    expect(bare.title).toBe("A bullet with no bold lead at all.");
    expect(bare.body).toBe("");
  });

  it("never turns the file preamble into an entry", () => {
    const all = parseReleases(SAMPLE).flatMap((d) => d.entries.map((e) => e.title));
    expect(all.join(" ")).not.toContain("Preamble");
  });

  it("returns nothing for an empty or headingless file rather than throwing", () => {
    expect(parseReleases("")).toEqual([]);
    expect(parseReleases("# Title\n\njust prose\n")).toEqual([]);
  });
});
