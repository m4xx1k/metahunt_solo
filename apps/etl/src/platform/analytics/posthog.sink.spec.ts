const mockCapture = jest.fn();
const mockAlias = jest.fn();
const mockShutdown = jest.fn();

jest.mock("posthog-node", () => ({
  PostHog: jest.fn().mockImplementation(() => ({
    capture: mockCapture,
    alias: mockAlias,
    shutdown: mockShutdown,
  })),
}));

import { ConfigService } from "@nestjs/config";

import { PostHogSink } from "./posthog.sink";

describe("PostHogSink", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShutdown.mockResolvedValue(undefined);
  });

  it("forwards privacy-safe events", () => {
    const sink = new PostHogSink(
      new ConfigService({ POSTHOG_API_KEY: "test-key", POSTHOG_HOST: "https://example.test" }),
    );

    sink.capture("journey-1", "subscription_created", { filterCount: 2 });

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "journey-1",
      event: "subscription_created",
      properties: { filterCount: 2 },
    });
  });

  it("contains provider failures", () => {
    const sink = new PostHogSink(new ConfigService({ POSTHOG_API_KEY: "test-key" }));
    mockCapture.mockImplementationOnce(() => {
      throw new Error("provider unavailable");
    });

    expect(() => sink.capture("journey-1", "digest_sent", {})).not.toThrow();
  });

  it("aliases an anonymous journey only to an opaque person id", () => {
    const sink = new PostHogSink(new ConfigService({ POSTHOG_API_KEY: "test-key" }));

    sink.alias("11111111-1111-1111-1111-111111111111", "journey-1");

    expect(mockAlias).toHaveBeenCalledWith({
      distinctId: "11111111-1111-1111-1111-111111111111",
      alias: "journey-1",
    });
  });

  it("stays dormant without a key", () => {
    const sink = new PostHogSink(new ConfigService());

    expect(() => sink.capture("journey-1", "digest_sent", {})).not.toThrow();
    expect(mockCapture).not.toHaveBeenCalled();
  });
});
