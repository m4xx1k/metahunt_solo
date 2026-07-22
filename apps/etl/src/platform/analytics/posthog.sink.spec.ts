const mockCapture = jest.fn();
const mockShutdown = jest.fn();

jest.mock("posthog-node", () => ({
  PostHog: jest.fn().mockImplementation(() => ({
    capture: mockCapture,
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

  it("stays dormant without a key", () => {
    const sink = new PostHogSink(new ConfigService());

    expect(() => sink.capture("journey-1", "digest_sent", {})).not.toThrow();
    expect(mockCapture).not.toHaveBeenCalled();
  });
});
