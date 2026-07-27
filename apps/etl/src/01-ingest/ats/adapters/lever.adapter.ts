import { z } from "zod";

import {
  cleanLocations,
  normalizeEmploymentType,
  normalizeRemote,
  type AtsAdapter,
  type NormalizedItem,
  type NormalizedSalary,
} from "../ats.contract";

const LeverPosting = z.object({
  id: z.string(),
  text: z.string(),
  description: z.string().nullish(),
  descriptionBody: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  hostedUrl: z.string().nullish(),
  applyUrl: z.string().nullish(),
  createdAt: z.number().nullish(),
  country: z.string().nullish(),
  workplaceType: z.string().nullish(),
  additional: z.string().nullish(),
  lists: z.array(z.object({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
  categories: z
    .object({
      commitment: z.string().nullish(),
      department: z.string().nullish(),
      team: z.string().nullish(),
      location: z.string().nullish(),
      allLocations: z.array(z.string()).nullish(),
    })
    .nullish(),
  salaryRange: z
    .object({
      min: z.number().nullish(),
      max: z.number().nullish(),
      currency: z.string().nullish(),
      interval: z.string().nullish(),
    })
    .nullish(),
});

const LeverBoard = z.array(LeverPosting);

/**
 * `description` is only the opening blurb — on provectus it is empty on 2 of
 * the first 8 postings while `lists[]` holds 8-22k chars of responsibilities
 * and requirements. Sending description alone would have starved the extractor
 * on every Lever board without failing loudly anywhere.
 */
function toDescription(posting: z.infer<typeof LeverPosting>): string {
  const sections = (posting.lists ?? []).map((section) =>
    [section.text ? `<h3>${section.text}</h3>` : "", section.content ?? ""]
      .filter(Boolean)
      .join("\n"),
  );
  return [
    posting.description ?? posting.descriptionBody ?? posting.descriptionPlain ?? "",
    ...sections,
    posting.additional ?? "",
  ]
    .filter((part) => part.trim())
    .join("\n\n");
}

function toSalary(range: z.infer<typeof LeverPosting>["salaryRange"]): NormalizedSalary | null {
  if (!range || (range.min == null && range.max == null)) return null;
  return {
    min: range.min ?? null,
    max: range.max ?? null,
    currency: range.currency ?? null,
    interval: range.interval ?? null,
    raw: JSON.stringify(range),
  };
}

export const leverAdapter: AtsAdapter = {
  type: "lever",

  boardUrl(slug) {
    return `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  },

  toItems(payload, slug) {
    const postings = LeverBoard.parse(payload);

    return postings.map((posting) => {
      // Kyivstar tags 100+ of its postings `location: "All"`; cleanLocations
      // strips it, so `country` is the only geography left on those rows.
      const locations = cleanLocations([
        posting.categories?.location,
        ...(posting.categories?.allLocations ?? []),
        posting.country,
      ]);

      return {
        externalId: posting.id,
        title: posting.text,
        descriptionHtml: toDescription(posting),
        link:
          posting.hostedUrl ?? posting.applyUrl ?? `https://jobs.lever.co/${slug}/${posting.id}`,
        publishedAt: posting.createdAt ? new Date(posting.createdAt) : null,
        locations,
        isRemote: normalizeRemote(posting.workplaceType),
        employmentType: normalizeEmploymentType(posting.categories?.commitment),
        department: posting.categories?.department ?? null,
        team: posting.categories?.team ?? null,
        salary: toSalary(posting.salaryRange),
      };
    }) satisfies NormalizedItem[];
  },
};
