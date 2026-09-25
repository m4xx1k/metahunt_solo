import { buildEmbeddingText } from "./embedding-text.builder";

describe("buildEmbeddingText (Tier 1 description-only)", () => {
  it("uses the cleaned description when present", () => {
    const res = buildEmbeddingText({
      title: "Senior Backend Engineer в Acme, Київ",
      description: "<p>We are looking for a Go developer to build scalable services.</p>",
    });

    expect(res.text).toBe("We are looking for a Go developer to build scalable services.");
    expect(res.hash).toHaveLength(64);
  });

  it("falls back to title when description is null or empty", () => {
    const res = buildEmbeddingText({
      title: "Lead AI Engineer",
      description: "   <div>  <br/> </div>  ",
    });

    expect(res.text).toBe("Title: Lead AI Engineer");
    expect(res.hash).toHaveLength(64);
  });
});
