import { z } from "zod";

import {
  cleanLocations,
  normalizeEmploymentType,
  normalizeRemote,
  type AtsAdapter,
  type NormalizedItem,
} from "../ats.contract";

const GreenhouseJob = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string().nullish(),
  absolute_url: z.string().nullish(),
  updated_at: z.string().nullish(),
  first_published: z.string().nullish(),
  location: z.object({ name: z.string().nullish() }).nullish(),
  offices: z.array(z.object({ name: z.string().nullish() })).nullish(),
  departments: z.array(z.object({ name: z.string().nullish() })).nullish(),
  metadata: z.array(z.object({ name: z.string().nullish(), value: z.unknown() })).nullish(),
});

const GreenhouseBoard = z.object({ jobs: z.array(GreenhouseJob) });

// `content` arrives HTML-escaped (`&lt;p&gt;`), unlike every other board.
const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function unescapeHtml(input: string): string {
  return input
    .replace(/&(?:lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    // `&amp;` last, so "&amp;lt;" does not become a literal "<".
    .replace(/&amp;/g, "&");
}

// Greenhouse has no employment-type field. Some boards put it in `metadata`
// under a free-text name; read it where present rather than sending every
// posting to the LLM for something the board already knows.
function employmentFromMetadata(metadata: z.infer<typeof GreenhouseJob>["metadata"]): string | null {
  const entry = metadata?.find((m) => /employment|job\s*type|contract\s*type/i.test(m.name ?? ""));
  return typeof entry?.value === "string" ? entry.value : null;
}

export const greenhouseAdapter: AtsAdapter = {
  type: "greenhouse",

  boardUrl(slug) {
    return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
  },

  toItems(payload, slug) {
    const board = GreenhouseBoard.parse(payload);

    return board.jobs.map((job) => {
      const locations = cleanLocations([job.location?.name, ...(job.offices ?? []).map((o) => o.name)]);

      return {
        externalId: String(job.id),
        title: job.title,
        descriptionHtml: unescapeHtml(job.content ?? ""),
        link: job.absolute_url ?? `https://boards.greenhouse.io/${slug}/jobs/${job.id}`,
        // `first_published` IS present on live payloads, contradicting
        // integration-research.md §3 which claims only `updated_at` exists.
        // Prefer it: `updated_at` moves on every edit and would fake a repost.
        publishedAt: job.first_published
          ? new Date(job.first_published)
          : job.updated_at
            ? new Date(job.updated_at)
            : null,
        locations,
        // No remote flag anywhere in the payload — infer from the location text.
        isRemote: locations.some((l) => /remote/i.test(l)) ? true : normalizeRemote(null),
        employmentType: normalizeEmploymentType(employmentFromMetadata(job.metadata)),
        department: job.departments?.[0]?.name ?? null,
        team: job.departments?.[1]?.name ?? null,
        // `pay_input_ranges` was null on every job of every board probed,
        // including at the per-job detail endpoint. Not modelled.
        salary: null,
      };
    }) satisfies NormalizedItem[];
  },
};
