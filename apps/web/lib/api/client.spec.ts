import { apiBase, buildQs } from "@/lib/api/client";

describe("buildQs", () => {
  it("returns an empty string for nullish/empty params", () => {
    expect(buildQs(undefined)).toBe("");
    expect(buildQs({})).toBe("");
  });

  it("skips undefined, null and empty-string values", () => {
    expect(buildQs({ a: undefined, b: null, c: "" })).toBe("");
  });

  it("serialises primitive values in insertion order", () => {
    expect(buildQs({ a: 1, b: "x", c: true })).toBe("?a=1&b=x&c=true");
  });

  it("repeats array values as multiple params", () => {
    expect(buildQs({ skills: ["a", "b"] })).toBe("?skills=a&skills=b");
  });

  it("skips non-primitive (object) values", () => {
    expect(buildQs({ keep: 1, drop: { nested: true } })).toBe("?keep=1");
  });
});

describe("apiBase", () => {
  const KEY = "NEXT_PUBLIC_API_URL";
  const original = process.env[KEY];
  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it("throws a helpful error when the base URL is unset", () => {
    delete process.env[KEY];
    expect(() => apiBase()).toThrow(/NEXT_PUBLIC_API_URL is not set/);
  });

  it("strips trailing slashes", () => {
    process.env[KEY] = "http://localhost:3000/";
    expect(apiBase()).toBe("http://localhost:3000");
  });

  it("returns the base unchanged when already clean", () => {
    process.env[KEY] = "http://localhost:3000";
    expect(apiBase()).toBe("http://localhost:3000");
  });
});
