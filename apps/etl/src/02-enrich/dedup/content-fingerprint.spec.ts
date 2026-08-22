import { contentFingerprint, normalizedVacancyContent } from "./content-fingerprint";

describe("exact content fingerprint", () => {
  it("uses the exact extraction input after normalized HTML cleaning", () => {
    expect(normalizedVacancyContent("  Backend Engineer ", "<p>Go &amp; Rust</p>")).toBe(
      "Title: Backend Engineer\n\nGo & Rust",
    );
    expect(contentFingerprint("Backend Engineer", "Go & Rust")).toBe(
      contentFingerprint(" Backend Engineer ", "<div>Go &amp; Rust</div>"),
    );
  });

  it("ignores title wrappers when the advertised body is identical", () => {
    expect(contentFingerprint("Lead Data Engineer", "Go")).toBe(
      contentFingerprint("Data Engineer (Architect)", "Go"),
    );
  });

  it("changes for a material description change and falls back to title without a body", () => {
    expect(contentFingerprint("Backend Engineer", "Go")).not.toBe(
      contentFingerprint("Backend Engineer", "Rust"),
    );
    expect(contentFingerprint("Backend Engineer", null)).not.toBe(
      contentFingerprint("Frontend Engineer", null),
    );
  });
});
