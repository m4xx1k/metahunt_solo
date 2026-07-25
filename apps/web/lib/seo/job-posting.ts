import type { EmploymentType, VacancyDto } from "@/lib/api/vacancies";

import { SITE_NAME, absoluteUrl } from "./site";
import { vacancyPath } from "./vacancy-url";

// Google's JobPosting requirements, and the reason this returns null so often:
// `title`, `datePosted`, `description`, `hiringOrganization` and `jobLocation`
// are all REQUIRED. Our extraction fills company on ~56% of vacancies and
// locations on ~39%, so emitting markup for everything would mean shipping
// invalid structured data at scale — which risks a manual action against the
// whole site's job results. Incomplete rows get a normal indexable page with no
// JSON-LD instead.

/** Matches the product's own freshness window (radar's DEFAULT_FRESHNESS_DAYS). */
export const VACANCY_VALID_DAYS = 30;

// Google's enum is not ours: it has no CONTRACT/FREELANCE/INTERNSHIP.
const EMPLOYMENT_TYPE: Record<EmploymentType, string> = {
  FULL_TIME: "FULL_TIME",
  PART_TIME: "PART_TIME",
  CONTRACT: "CONTRACTOR",
  FREELANCE: "CONTRACTOR",
  INTERNSHIP: "INTERN",
};

type PostalAddress = {
  "@type": "PostalAddress";
  addressLocality?: string;
  addressCountry: string;
};

/** Locations arrive as "Kyiv, Ukraine". "Ukraine, Ukraine" exists in the data,
 *  so a locality equal to the country is dropped rather than repeated. */
export function parseLocation(raw: string): PostalAddress | null {
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const country = parts[parts.length - 1];
  const locality = parts.slice(0, -1).join(", ");
  if (!locality || locality === country)
    return { "@type": "PostalAddress", addressCountry: country };
  return { "@type": "PostalAddress", addressLocality: locality, addressCountry: country };
}

export function validThrough(publishedAt: string): string {
  const from = new Date(publishedAt);
  return new Date(from.getTime() + VACANCY_VALID_DAYS * 86_400_000).toISOString();
}

export function isExpired(publishedAt: string | null, now: number): boolean {
  if (!publishedAt) return false;
  return new Date(validThrough(publishedAt)).getTime() < now;
}

/**
 * JobPosting for one vacancy, or null when it cannot satisfy Google's required
 * fields. `now` is injected rather than read from the clock so the expiry branch
 * is testable.
 */
export function buildJobPosting(v: VacancyDto, now: number): Record<string, unknown> | null {
  const company = v.company?.name?.trim();
  const description = v.description?.trim();
  const datePosted = v.publishedAt;
  const title = v.role?.name?.trim() || v.title.trim();

  if (!company || !description || !datePosted || !title) return null;

  // Google requires expired postings to be removed from its index. We keep the
  // page for people and drop the markup, which is one of its sanctioned methods.
  if (isExpired(datePosted, now)) return null;

  const addresses = v.locations.map(parseLocation).filter((a): a is PostalAddress => a !== null);
  const isRemote = v.workFormat === "REMOTE";
  // A posting with neither a place of work nor a remote flag can't say where the
  // job is, and jobLocation is required.
  if (addresses.length === 0 && !isRemote) return null;

  const posting: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title,
    description,
    datePosted,
    validThrough: validThrough(datePosted),
    identifier: { "@type": "PropertyValue", name: company, value: v.externalId },
    hiringOrganization: { "@type": "Organization", name: company },
    // We route applications to the source board, so this is false. Claiming
    // otherwise is exactly what Google's directApply guidance is about.
    directApply: false,
    url: absoluteUrl(vacancyPath({ id: v.id, roleName: v.role?.name, title: v.title })),
    // Not the employer: the aggregator that published this page.
    sourceOrganization: { "@type": "Organization", name: SITE_NAME },
  };

  if (addresses.length > 0) {
    posting.jobLocation = addresses.map((address) => ({ "@type": "Place", address }));
  }
  if (isRemote) {
    posting.jobLocationType = "TELECOMMUTE";
    posting.applicantLocationRequirements = { "@type": "Country", name: "Ukraine" };
  }
  if (v.employmentType) posting.employmentType = EMPLOYMENT_TYPE[v.employmentType];
  if (v.experienceYears !== null && v.experienceYears > 0) {
    posting.experienceRequirements = {
      "@type": "OccupationalExperienceRequirements",
      monthsOfExperience: v.experienceYears * 12,
    };
  }
  const skills = v.skills.required.map((s) => s.name);
  if (skills.length > 0) posting.skills = skills.join(", ");
  if (v.domain?.name) posting.industry = v.domain.name;

  // baseSalary is deliberately absent. It needs a pay period, and nothing in the
  // pipeline extracts one — a guessed "MONTH" would misstate compensation on a
  // job ad. It is a recommended field, not a required one.
  return posting;
}
