import { proxyActivities } from "@temporalio/workflow";
import type { LoadVacancyActivity } from "../activities/load-vacancy.activity";

const { loadVacancy } = proxyActivities<typeof LoadVacancyActivity.prototype>({
  startToCloseTimeout: "1m",
  retry: { maximumAttempts: 3, initialInterval: "5s", backoffCoefficient: 2 },
});

export async function vacancyPipelineWorkflow(
  rssRecordId: string,
): Promise<void> {
  await loadVacancy(rssRecordId);
  // Future stages append here (no workflow rewrite needed):
  //   const vacancyId = await loadVacancy(rssRecordId);
  //   await dedupVacancy(vacancyId);
  //   await notifyVacancy(vacancyId);
}
