import { apiBase, buildQs, publicApiBase } from "@/lib/api/client";

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
  const INTERNAL = "API_INTERNAL_URL";
  const original = process.env[KEY];
  const originalInternal = process.env[INTERNAL];
  const restore = (k: string, v: string | undefined) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  afterEach(() => {
    restore(KEY, original);
    restore(INTERNAL, originalInternal);
  });

  it("throws a helpful error when the base URL is unset", () => {
    delete process.env[KEY];
    delete process.env[INTERNAL];
    expect(() => apiBase()).toThrow(/NEXT_PUBLIC_API_URL is not set/);
  });

  it("strips trailing slashes", () => {
    delete process.env[INTERNAL];
    process.env[KEY] = "http://localhost:3000/";
    expect(apiBase()).toBe("http://localhost:3000");
  });

  it("returns the base unchanged when already clean", () => {
    delete process.env[INTERNAL];
    process.env[KEY] = "http://localhost:3000";
    expect(apiBase()).toBe("http://localhost:3000");
  });

  // jest runs in node (no window) → the server branch, which prefers the
  // internal URL so in-container SSR reaches etl over the docker network.
  it("prefers API_INTERNAL_URL over the public URL server-side", () => {
    process.env[KEY] = "http://localhost:3333";
    process.env[INTERNAL] = "http://etl:3333/";
    expect(apiBase()).toBe("http://etl:3333");
  });

  it("keeps rendered URLs on the public origin server-side", () => {
    process.env[KEY] = "http://localhost:3333/";
    process.env[INTERNAL] = "http://etl:3333";
    expect(publicApiBase()).toBe("http://localhost:3333");
  });
});
