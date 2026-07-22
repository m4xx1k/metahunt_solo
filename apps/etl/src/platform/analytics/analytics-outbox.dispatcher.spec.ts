import type { AnalyticsOutboxWriter, AnalyticsSink, ProductEventWrite } from "./analytics.ports";
import { AnalyticsOutboxDispatcher } from "./analytics-outbox.dispatcher";

const EVENT: ProductEventWrite = {
  journeyId: "11111111-1111-1111-1111-111111111111",
  name: "subscription_created",
  source: "api",
  dedupeKey: "subscription_created:test",
  properties: { $insert_id: "subscription_created:test" },
};

describe("AnalyticsOutboxDispatcher", () => {
  it("leaves a failed batch pending and succeeds on the next dispatch", async () => {
    const drain = jest
      .fn<Promise<ProductEventWrite[]>, [number]>()
      .mockRejectedValueOnce(new Error("temporary database failure"))
      .mockResolvedValueOnce([EVENT])
      .mockResolvedValueOnce([]);
    const outbox = { drain, enqueue: jest.fn() } as AnalyticsOutboxWriter;
    const capture = jest.fn();
    const sink: AnalyticsSink = { capture };
    const dispatcher = new AnalyticsOutboxDispatcher(outbox, sink);

    await expect(dispatcher.dispatch()).resolves.toBeUndefined();
    expect(capture).not.toHaveBeenCalled();

    await expect(dispatcher.dispatch()).resolves.toBeUndefined();
    expect(capture).toHaveBeenCalledWith(EVENT.journeyId, EVENT.name, EVENT.properties);
  });
});
