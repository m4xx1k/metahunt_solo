import { AlertsActivity } from "./alerts.activity";

describe("AlertsActivity.deliverAlertsToChat", () => {
  const deliverChat = jest.fn();
  const activity = new AlertsActivity({} as never, { deliverChat } as never);

  beforeEach(() => deliverChat.mockReset());

  it("returns the chat run's counts", async () => {
    deliverChat.mockResolvedValue({ sent: 2 });
    await expect(activity.deliverAlertsToChat("chat-owner")).resolves.toEqual({ sent: 2 });
  });

  // Retrying cannot fix a blocked bot; the workflow moves on to the next chat.
  it("maps an unreachable chat to a non-retryable failure", async () => {
    deliverChat.mockRejectedValue({ error_code: 403 });
    await expect(activity.deliverAlertsToChat("chat-owner")).rejects.toMatchObject({
      nonRetryable: true,
      type: "TelegramChatUnreachable",
    });
  });

  it("lets a transient failure stay retryable", async () => {
    const error = new Error("socket hang up");
    deliverChat.mockRejectedValue(error);
    await expect(activity.deliverAlertsToChat("chat-owner")).rejects.toBe(error);
  });
});
