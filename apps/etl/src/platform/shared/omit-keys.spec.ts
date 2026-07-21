import { omitKeys } from "./omit-keys";

describe("omitKeys", () => {
  it("returns a copy without the selected keys", () => {
    const input = { id: "vacancy-1", title: "Backend Engineer", loadedAt: new Date(0) };

    const result = omitKeys(input, ["id", "loadedAt"] as const);

    expect(result).toEqual({ title: "Backend Engineer" });
    expect(input).toEqual({
      id: "vacancy-1",
      title: "Backend Engineer",
      loadedAt: new Date(0),
    });
  });

  it("does not mutate the original object", () => {
    const input = { sourceId: "source-1", externalId: "external-1" };

    const result = omitKeys(input, ["sourceId"] as const);

    expect(result).not.toBe(input);
    expect(input).toHaveProperty("sourceId", "source-1");
  });
});
