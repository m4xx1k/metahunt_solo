import { Test } from "@nestjs/testing";

import { DigestService } from "../digest.service";
import { SubscriptionsService } from "../subscriptions.service";

import { NotifyActivity } from "./notify.activity";

describe("NotifyActivity", () => {
  const deliver = jest.fn();
  let activity: NotifyActivity;

  beforeEach(async () => {
    deliver.mockReset().mockResolvedValue(2);
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotifyActivity,
        { provide: SubscriptionsService, useValue: { listActiveIds: jest.fn() } },
        { provide: DigestService, useValue: { deliver } },
      ],
    }).compile();
    activity = moduleRef.get(NotifyActivity);
  });

  it("returns the digest's new-vacancy count", async () => {
    await expect(activity.deliverToSubscription("subscription-1")).resolves.toBe(2);
    expect(deliver).toHaveBeenCalledWith("subscription-1");
  });

  // A blocked bot cannot be fixed by retrying: the activity must fail on the
  // first attempt so the workflow moves to the next subscriber.
  it("maps an unreachable chat to a non-retryable failure", async () => {
    deliver.mockRejectedValue({ error_code: 403 });

    await expect(activity.deliverToSubscription("subscription-1")).rejects.toMatchObject({
      nonRetryable: true,
      type: "TelegramChatUnreachable",
    });
  });

  it("lets a transient failure stay retryable", async () => {
    const error = new Error("telegram timeout");
    deliver.mockRejectedValue(error);

    await expect(activity.deliverToSubscription("subscription-1")).rejects.toBe(error);
  });
});
