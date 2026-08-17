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

  it("changes for material title or description changes", () => {
    expect(contentFingerprint("Backend Engineer", "Go")).not.toBe(
      contentFingerprint("Frontend Engineer", "Go"),
    );
  });
});
