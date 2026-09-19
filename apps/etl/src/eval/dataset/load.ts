import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { RequirementDatasetCase } from "../types";

const DATASET_PATH = join(__dirname, "vacancy-requirements-v2.dataset.json");

export function loadDataset(): RequirementDatasetCase[] {
  const raw = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error("dataset must be a JSON array of cases");
  return raw.map(parseDatasetCase);
}

export function parseDatasetCase(item: {
  input?: unknown;
  expectedOutput?: unknown;
  metadata?: unknown;
}): RequirementDatasetCase {
  const input = item.input as RequirementDatasetCase["input"];
  const expectedOutput = item.expectedOutput as RequirementDatasetCase["expectedOutput"];
  const metadata = item.metadata as RequirementDatasetCase["metadata"];
  if (
    !input ||
    typeof input.id !== "string" ||
    typeof input.title !== "string" ||
    typeof input.text !== "string" ||
    !expectedOutput ||
    !Array.isArray(expectedOutput.requirements) ||
    !metadata ||
    !["draft", "approved", "rejected"].includes(metadata.reviewStatus) ||
    !Array.isArray(metadata.slices)
  ) {
    throw new Error(
      "dataset row must use the Requirements v2 input, expectedOutput, and metadata shape",
    );
  }
  return { input, expectedOutput, metadata };
}
