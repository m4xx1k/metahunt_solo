import { serializeJsonLd } from "./serialize-json-ld";

describe("serializeJsonLd", () => {
  it("neutralises a closing script tag hidden in the payload", () => {
    // Vacancy descriptions are scraped HTML, so this is a real input, not a hypothetical.
    const out = serializeJsonLd({ description: "<p>hi</p></script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("\\u003c");
  });

  it("still round-trips to the original value", () => {
    const data = { "@type": "JobPosting", description: "<p>a < b</p>", title: "Go & Rust" };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it("leaves payloads without angle brackets alone", () => {
    expect(serializeJsonLd({ a: 1 })).toBe('{"a":1}');
  });
});
