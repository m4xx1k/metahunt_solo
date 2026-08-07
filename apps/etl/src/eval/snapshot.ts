import { createHash } from "node:crypto";

import type { EvaluationSnapshot } from "./types";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function assertCorpusSnapshot(
  corpus: Record<string, string>,
  snapshot: EvaluationSnapshot,
): void {
  if (sha256(JSON.stringify(corpus)) !== snapshot.corpusSha256) {
    throw new Error(
      "corpus differs from snapshot — create a new golden snapshot before continuing",
    );
  }
}
