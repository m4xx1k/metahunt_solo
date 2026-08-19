import { existsSync } from "node:fs";

import { paths, readJson, writeJson } from "../paths";
import {
  FIELDS,
  type CandidatesFile,
  type Extraction,
  type LabelCandidate,
  type Manifest,
} from "../types";

const DEFAULTS: Partial<Record<(typeof FIELDS)[number], unknown>> = {
  skills: { required: [], optional: [] },
  locations: [],
};

/**
 * Starts one transparent human-review pass from the current production output.
 * This is deliberately not a fake second labeller: every field is surfaced as
 * `prod-differs`, so the reviewer sees the source and can keep or correct it.
 */
export function candidatesFromProduction(
  manifest: Manifest,
  production: Record<string, Extraction>,
): CandidatesFile {
  const candidates: LabelCandidate[] = manifest.entries.map((entry) => {
    const extracted = production[entry.id] ?? {};
    const fields = Object.fromEntries(
      FIELDS.map((field) => {
        const value = extracted[field] ?? DEFAULTS[field] ?? null;
        return [
          field,
          {
            value,
            verdict: "prod-differs" as const,
            a: null,
            b: null,
            prod: value,
          },
        ];
      }),
    ) as LabelCandidate["fields"];

    return { id: entry.id, title: entry.title, link: entry.link, source: entry.source, fields };
  });
  return { generatedAt: new Date().toISOString(), candidates };
}

export async function prepareReview(): Promise<void> {
  const existing = [paths.candidates, paths.decisions, paths.dataset].filter(existsSync);
  if (existing.length > 0) {
    throw new Error(
      `refusing to replace existing review artifacts: ${existing.join(", ")}. Start a new GOLDEN_DIR instead.`,
    );
  }
  const manifest = readJson<Manifest>(paths.manifest);
  const production = readJson<Record<string, Extraction>>(paths.run("prod"));
  const candidates = candidatesFromProduction(manifest, production);
  writeJson(paths.candidates, candidates);
  console.log(
    `prepared ${candidates.candidates.length} postings for full human review → ${paths.candidates}`,
  );
}
