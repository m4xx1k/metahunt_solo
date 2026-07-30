import { createSubscriptionName } from "./subscription-name";

describe("createSubscriptionName", () => {
  it("creates a stable readable name", () => {
    expect(createSubscriptionName("12345678-1234-1234-1234-123456789abc")).toBe(
      "Midnight Otter #123456",
    );
  });

  it("changes with the identifier prefix", () => {
    expect(createSubscriptionName("abcdef00-1234-1234-1234-123456789abc")).not.toBe(
      createSubscriptionName("12345678-1234-1234-1234-123456789abc"),
    );
  });
});
