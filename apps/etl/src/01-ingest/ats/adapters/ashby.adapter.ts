import { z } from "zod";

import {
  cleanLocations,
  normalizeEmploymentType,
  normalizeRemote,
  type AtsAdapter,
  type NormalizedItem,
  type NormalizedSalary,
} from "../ats.contract";

const CompensationComponent = z.object({
  compensationType: z.string().nullish(),
  interval: z.string().nullish(),
  currencyCode: z.string().nullish(),
  minValue: z.number().nullish(),
  maxValue: z.number().nullish(),
});

const AshbyJob = z.object({
  id: z.string(),
  title: z.string(),
  descriptionHtml: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  jobUrl: z.string().nullish(),
  applyUrl: z.string().nullish(),
  publishedAt: z.string().nullish(),
  location: z.string().nullish(),
  // Sometimes plain strings, sometimes {location}. Both appear in the wild.
  secondaryLocations: z
    .array(z.union([z.string(), z.object({ location: z.string().nullish() })]))
    .nullish(),
  isRemote: z.boolean().nullish(),
  isListed: z.boolean().nullish(),
  workplaceType: z.string().nullish(),
  employmentType: z.string().nullish(),
  department: z.string().nullish(),
  team: z.string().nullish(),
  compensation: z
    .object({
      compensationTierSummary: z.string().nullish(),
      compensationTiers: z.array(z.object({ components: z.array(CompensationComponent).nullish() })).nullish(),
    })
    .nullish(),
});

const AshbyBoard = z.object({ jobs: z.array(AshbyJob) });

/**
 * Ashby ships a `compensation` object on EVERY job — verified 46/46 on
 * `solidgate`, all with empty tiers. Testing for the object's presence
 * therefore measures nothing; only a tier carrying real numbers counts.
 */
function toSalary(compensation: z.infer<typeof AshbyJob>["compensation"]): NormalizedSalary | null {
  const salaryComponent = compensation?.compensationTiers
    ?.flatMap((tier) => tier.components ?? [])
    .find((c) => c.compensationType?.toLowerCase() === "salary" && (c.minValue != null || c.maxValue != null));
  if (!salaryComponent) return null;

  return {
    min: salaryComponent.minValue ?? null,
    max: salaryComponent.maxValue ?? null,
    currency: salaryComponent.currencyCode ?? null,
    interval: salaryComponent.interval ?? null,
    raw: JSON.stringify(compensation),
  };
}

export const ashbyAdapter: AtsAdapter = {
  type: "ashby",

  boardUrl(slug) {
    return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`;
  },

  toItems(payload, slug) {
    const board = AshbyBoard.parse(payload);

    return board.jobs
      // `isListed: false` is a posting the company has taken off its own board.
      .filter((job) => job.isListed !== false)
      .map((job) => ({
        externalId: job.id,
        title: job.title,
        descriptionHtml: job.descriptionHtml ?? job.descriptionPlain ?? "",
        link: job.jobUrl ?? job.applyUrl ?? `https://jobs.ashbyhq.com/${slug}/${job.id}`,
        publishedAt: job.publishedAt ? new Date(job.publishedAt) : null,
        locations: cleanLocations([
          job.location,
          ...(job.secondaryLocations ?? []).map((l) => (typeof l === "string" ? l : l.location)),
        ]),
        isRemote: normalizeRemote(job.workplaceType, job.isRemote),
        employmentType: normalizeEmploymentType(job.employmentType),
        department: job.department ?? null,
        team: job.team ?? null,
        salary: toSalary(job.compensation),
      })) satisfies NormalizedItem[];
  },
};
