import { decodeText, encodeText } from "./corpus-codec";

describe("corpus codec", () => {
  const cases: [string, string][] = [
    ["ascii", "Title: Senior Backend Developer\n\nRemote. $6000-$8000 / month."],
    ["cyrillic", "Title: Розробник\n\nБронь надається. Вилка 60 000–90 000 грн."],
    ["mixed with emoji", "Title: Full Stack JS\n\nПривіт! 🙌 React + Node.js, B2 English."],
    ["entities already stripped", "Title: QA\n\n• manual testing • Postman • SQL"],
  ];

  it.each(cases)("round-trips %s", (_name, text) => {
    expect(decodeText(encodeText(text))).toBe(text);
  });

  it("round-trips a posting longer than the corpus maximum", () => {
    const text = "Вимоги: TypeScript, PostgreSQL, AWS. ".repeat(2000);
    expect(decodeText(encodeText(text))).toBe(text);
  });

  it("round-trips the empty string", () => {
    expect(decodeText(encodeText(""))).toBe("");
  });

  it("leaves no plaintext for a crawler or code search to hit", () => {
    const encoded = encodeText("Title: Senior Rust Developer at Bolt\n\nБронь надається.");
    expect(encoded).not.toContain("Rust");
    expect(encoded).not.toContain("Bolt");
    expect(encoded).not.toContain("Бронь");
    expect(Buffer.from(encoded, "base64").toString("utf8")).not.toContain("Rust");
  });

  // Pinned to a literal, not to encodeText() called twice: the real churn risk is a
  // Node/zlib upgrade changing deflate output, which self-comparison cannot see.
  it("is byte-stable, so re-encoding does not churn the committed corpus", () => {
    expect(encodeText("Title: DevOps Engineer\n\nKubernetes, Helm, ArgoCD.")).toBe(
      "g1:cu58YWh1bnQvZGSlSKwnmCEVPQCFHkUzBKwjuqI/YEqNjpZLI2derz8APxy7NIQppby7JV1LJaMTE78uc2d9WpoAbWV0",
    );
  });

  it("names the problem when an entry predates the current format", () => {
    const legacy = encodeText("Title: QA").slice("g1:".length);
    expect(() => decodeText(legacy)).toThrow(/regenerate with golden:sample/);
  });
});
