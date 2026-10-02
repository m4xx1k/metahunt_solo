import { ConfigService } from "@nestjs/config";

import { NotifySchedulerService } from "./notify-scheduler.service";

function scheduler(env: Record<string, string>) {
  const create = jest.fn().mockResolvedValue(undefined);
  const temporal = { client: { getRawClient: () => ({ schedule: { create } }) } };
  const service = new NotifySchedulerService(
    temporal as never,
    new ConfigService({ TELEGRAM_BOT_TOKEN: "token", TEMPORAL_TASK_QUEUE: "q", ...env }),
  );
  return { service, create };
}

describe("NotifySchedulerService.ensureSchedule", () => {
  // A rollback by env or by deploy relies on this: v1 boots back to v1's workflow.
  it("keeps v1's workflow, untouched, while alerts v2 is off", async () => {
    const { service, create } = scheduler({ ALERTS_ENGINE: "v1" });
    await service.ensureSchedule();
    expect(create.mock.calls[0][0].action).toEqual({
      type: "startWorkflow",
      workflowType: "notifySubscribersWorkflow",
      taskQueue: "q",
      workflowId: "tg-digest",
    });
  });

  it.each<Record<string, string>>([{ ALERTS_V2_CHAT_IDS: "chat-owner" }, { ALERTS_ENGINE: "v2" }])(
    "switches to the split workflow with a 50m cap once v2 is in play (%o)",
    async (env) => {
      const { service, create } = scheduler(env);
      await service.ensureSchedule();
      expect(create.mock.calls[0][0].action).toMatchObject({
        workflowType: "deliverAlertsWorkflow",
        workflowId: "tg-digest",
        workflowExecutionTimeout: "50m",
      });
    },
  );
});
