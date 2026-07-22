import { countObjectKeys } from "./object-properties";

describe("countObjectKeys", () => {
  it("counts records", () => {
    expect(countObjectKeys({ q: "backend", roles: ["backend-engineer"] })).toBe(2);
  });

  it.each([null, undefined, "value", ["value"]])("rejects non-record input: %p", (value) => {
    expect(countObjectKeys(value)).toBe(0);
  });
});
