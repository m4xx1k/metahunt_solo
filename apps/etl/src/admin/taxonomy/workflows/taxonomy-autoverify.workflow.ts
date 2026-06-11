import { proxyActivities } from "@temporalio/workflow";
import type { TaxonomyAutoverifyActivity } from "../activities/taxonomy-autoverify.activity";

// Single UPDATE over nodes/vacancy_nodes — fast even on the full corpus.
// Idempotent → a retry just promotes nothing new.
const { taxonomyAutoverify } = proxyActivities<
  typeof TaxonomyAutoverifyActivity.prototype
>({
  startToCloseTimeout: "5m",
  retry: { maximumAttempts: 2, initialInterval: "30s", backoffCoefficient: 2 },
});

export async function taxonomyAutoverifyWorkflow(): Promise<void> {
  await taxonomyAutoverify();
}
