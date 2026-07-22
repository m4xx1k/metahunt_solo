import { Test } from "@nestjs/testing";

jest.mock("@temporalio/activity", () => ({
  ...jest.requireActual("@temporalio/activity"),
  activityInfo: jest.fn(),
}));

import { activityInfo } from "@temporalio/activity";

import { DigestService } from "../digest.service";
import { SubscriptionsService } from "../subscriptions.service";

import { NotifyActivity } from "./notify.activity";

describe("NotifyActivity", () => {
  const deliver = jest.fn();
  let activity: NotifyActivity;

  beforeEach(async () => {
    deliver.mockReset().mockResolvedValue(2);
    (activityInfo as jest.Mock).mockReturnValue({
      activityId: "2",
      workflowExecution: { runId: "run-1", workflowId: "notify-subscribers" },
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotifyActivity,
        { provide: SubscriptionsService, useValue: { listActiveIds: jest.fn() } },
        { provide: DigestService, useValue: { deliver } },
      ],
    }).compile();
    activity = moduleRef.get(NotifyActivity);
  });

  it("uses a retry-stable Temporal evaluation id", async () => {
    await expect(activity.deliverToSubscription("subscription-1")).resolves.toBe(2);

    expect(deliver).toHaveBeenCalledWith("subscription-1", "run-1:2");
  });
});
