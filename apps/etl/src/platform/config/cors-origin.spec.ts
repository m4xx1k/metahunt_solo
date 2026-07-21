import { corsOrigin } from "./cors-origin";

describe("corsOrigin", () => {
  it("normalizes a configured web URL to its origin", () => {
    expect(corsOrigin("https://metahunt.io/app/")).toBe("https://metahunt.io");
  });

  it("preserves a local development port", () => {
    expect(corsOrigin("http://localhost:4000")).toBe("http://localhost:4000");
  });
});
