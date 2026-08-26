import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import sanitizeHtml from "sanitize-html";

import { Footer } from "@/app/_components/Footer";
import { Header } from "@/app/_components/Header";
import { ApplyLink } from "@/entities/vacancy/ApplyLink";
import { formatLocations } from "@/entities/vacancy/format-locations";
import { ApiError } from "@/lib/api/client";
import { facetsApi, type NodeFacet } from "@/lib/api/facets";
import { vacanciesApi, type FeedDuplicateGroup, type VacancyDto } from "@/lib/api/vacancies";
import {
  ENGLISH_LABELS,
  SENIORITY_LABELS,
  formatExperience,
  formatSalary,
} from "@/lib/extracted-vacancy";
import { cn, STICKY_RAIL, STICKY_RAIL_LG } from "@/lib/utils";
import { breadcrumbJsonLd } from "@/lib/seo/breadcrumbs";
import { ROLE_HUB_MIN_VACANCIES } from "@/lib/seo/hub-meta";
import { buildJobPosting, isExpired } from "@/lib/seo/job-posting";
import { JsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { vacancyTitle } from "@/lib/seo/vacancy-meta";
import { parseVacancyId, vacancyPath } from "@/lib/seo/vacancy-url";
import { Tag } from "@/ui";

import { VacancyHero } from "./_components/VacancyHero";
import { VacancyRail } from "./_components/VacancyRail";
import { VacancySpecRail, type Spec } from "./_components/VacancySpecRail";

// Was force-dynamic, which sent `cache-control: no-store` and made every
// Googlebot hit a full uncached render (~1.9s). At ~4.9k indexable vacancies
// that is the crawl budget, so these pages are ISR now.
//
// force-static is what makes it stick: lib/api reads the session cookie on every
// server call, and a cookie read alone keeps the route dynamic and uncacheable.
// force-static makes cookies() return empty, which is the correct answer here —
// this page renders identically for everyone, signed in or not.
export const dynamic = "force-static";
export const revalidate = 900;

const SIMILAR_COUNT = 4;

type PageParams = { slug: string };

// DOU/Djinni descriptions arrive as raw HTML — sanitize server-side before
// dangerouslySetInnerHTML so only a safe, styled subset ever reaches the client.
const DESCRIPTION_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "ul",
    "ol",
    "li",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "h2",
    "h3",
    "h4",
    "blockquote",
    "code",
    "pre",
    "a",
    "span",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer nofollow",
    }),
  },
};

// Any vacancy row 404s the same way (bad uuid or missing row) — the controller
// always throws NotFoundException, so this is the one place that tells "not
// found" apart from a real backend outage.
async function loadVacancy(id: string): Promise<VacancyDto | null> {
  return vacanciesApi.byId(id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });
}

// The expiry check needs a clock, and buildJobPosting takes `now` as an argument
// so its expiry branch stays testable. Reading it here rather than inline in the
// component keeps that injection point while satisfying react-hooks/purity: this
// page is ISR, so it renders once per revalidation, and the window is 30 days —
// a render-time clock read cannot make the result unstable.
function clockNow(): number {
  return Date.now();
}

/**
 * The role hub lives on the role's slug, but the vacancy DTO carries the role's
 * UUID — so the slug is looked up by canonical name from the facet catalog. Worth
 * one cached request: it is the crawl path from ~4,900 vacancy pages into the
 * role hubs, which otherwise only the sitemap points at.
 */
async function loadRoleHubSlug(vacancy: VacancyDto): Promise<string | null> {
  if (!vacancy.role) return null;
  const roles = await facetsApi
    .roles()
    .then((r) => r.roles)
    .catch((): NodeFacet[] => []);
  const match = roles.find((r) => r.name === vacancy.role?.name);
  return match && match.count >= ROLE_HUB_MIN_VACANCIES ? match.id : null;
}

// Other openings for the same role. `roleIds` takes node slugs, but the resolver
// passes a UUID straight through, so the DTO's role id works as-is.
async function loadSimilar(vacancy: VacancyDto): Promise<VacancyDto[]> {
  if (!vacancy.role) return [];
  const res = await vacanciesApi
    .list({ roleIds: [vacancy.role.id], page: 1, pageSize: SIMILAR_COUNT + 1 })
    .catch(() => null);
  return (res?.items ?? []).filter((v) => v.id !== vacancy.id).slice(0, SIMILAR_COUNT);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const id = parseVacancyId(slug);
  if (!id) return {};
  const vacancy = await loadVacancy(id);
  if (!vacancy) return {};

  const role = vacancy.role?.name ?? vacancy.title;
  const company = vacancy.company?.name;
  const title = vacancyTitle({
    role,
    seniority: vacancy.seniority ? SENIORITY_LABELS[vacancy.seniority] : null,
    // Most specific distinguishing fact available, in that order.
    qualifier: company ?? vacancy.locations[0] ?? vacancy.source.displayName.trim(),
  });

  const salary = formatSalary({
    min: vacancy.salary.min,
    max: vacancy.salary.max,
    currency: vacancy.salary.currency,
  });
  const dedupLine =
    vacancy.duplicateCount && vacancy.duplicateCount > 1
      ? ` Опубліковано ${vacancy.duplicateCount}× на ${vacancy.duplicateSourceCount ?? 1} джерелах — metahunt звів до однієї картки.`
      : "";
  const description = [
    `${role}${company ? ` в ${company}` : ""}${vacancy.locations[0] ? `, ${vacancy.locations[0]}` : ""}.`,
    salary ? `${salary}.` : "",
    dedupLine || " Вакансія з DOU і Djinni в одному списку, без дублів.",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return pageMetadata({
    title,
    description,
    // Always the slugged form, never the requested one — a bare-uuid request
    // must not self-canonicalise or both URLs stay in the index.
    path: vacancyPath({ id, roleName: vacancy.role?.name, title: vacancy.title }),
    // Google requires expired postings out of its index; the page stays up for
    // people who followed a link, but it stops asking to be ranked.
    noindex: isExpired(vacancy.publishedAt, clockNow()),
    // This route has its own opengraph-image.tsx; taking the site default too
    // would emit two og:image tags and leave the winner to the crawler.
    ogImagePath: null,
  });
}

export default async function VacancyDetailPage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const id = parseVacancyId(slug);
  if (!id) notFound();
  const vacancy = await loadVacancy(id);
  if (!vacancy) notFound();

  // One vacancy, one URL: the bare-uuid form and any stale slug (the role was
  // renamed, someone hand-edited the path) redirect onto the canonical one.
  const canonicalPath = vacancyPath({
    id,
    roleName: vacancy.role?.name,
    title: vacancy.title,
  });
  if (`/vacancy/${slug}` !== canonicalPath) permanentRedirect(canonicalPath);

  // Named sources for the hero stat ("DOU + Djinni"); falls back to the bare
  // counter already on the vacancy DTO if the group fetch hiccups.
  // `similar` gives these pages an internal route to each other — without it a
  // vacancy is a dead end and only the sitemap ever points at it.
  const [group, similar, roleHubSlug] = await Promise.all([
    vacancy.uniqueVacancyId
      ? vacanciesApi.group(vacancy.uniqueVacancyId).catch((): FeedDuplicateGroup | null => null)
      : Promise.resolve(null),
    loadSimilar(vacancy),
    loadRoleHubSlug(vacancy),
  ]);
  const sourceNames = group
    ? Array.from(new Set(group.members.map((m) => m.source.displayName.trim())))
    : [];

  const role = vacancy.role?.name ?? vacancy.title;
  const english = vacancy.englishLevel ? ENGLISH_LABELS[vacancy.englishLevel] : null;
  const experience = formatExperience(vacancy.experienceYears);
  const loc = formatLocations(vacancy.locations);
  const descriptionHtml = vacancy.description
    ? sanitizeHtml(vacancy.description, DESCRIPTION_SANITIZE_OPTIONS).trim()
    : "";

  // The rail carries the requirements, the hero carries the identity. Anything
  // absent drops out rather than rendering an empty row.
  const specs: Spec[] = [
    english ? { label: "english", value: english } : null,
    experience ? { label: "experience", value: experience } : null,
    vacancy.domain ? { label: "domain", value: vacancy.domain.name } : null,
    loc ? { label: "location", value: loc } : null,
  ].filter((s): s is Spec => s !== null);
  // Every spec field is nullable, so "no specs at all" is reachable — and a fixed
  // 248px track would then reserve an empty gutter and shove the page right.
  const hasSpecs = specs.length > 0;

  const jobPosting = buildJobPosting(vacancy, clockNow());

  return (
    <>
      {/* Null whenever a Google-required field is missing — see job-posting.ts. */}
      {jobPosting ? <JsonLd data={jobPosting} /> : null}
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Вакансії", path: "/" },
          { name: role, path: canonicalPath },
        ])}
      />
      <Header links={[{ label: "усі вакансії", href: "/" }]} cta={null} />
      <main className="page-dot-grid bg-bg">
        <section className="border-b border-border px-4 py-10 sm:px-6 sm:py-14 md:px-10 md:py-20 xl:px-12">
          <VacancyHero vacancy={vacancy} role={role} sourceNames={sourceNames} />
        </section>

        <section className="px-4 py-10 sm:px-6 md:px-10 md:py-12 xl:px-12">
          <div
            className={cn(
              "mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-8 lg:items-start",
              hasSpecs
                ? "lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_336px]"
                : "xl:grid-cols-[minmax(0,1fr)_336px]",
            )}
          >
            <VacancySpecRail
              specs={specs}
              className={cn(
                "lg:col-start-1 lg:row-start-1 lg:row-span-2 xl:row-span-1",
                STICKY_RAIL_LG,
              )}
            />

            <div
              className={cn(
                "flex min-w-0 flex-col gap-8",
                hasSpecs ? "lg:col-start-2 lg:row-start-1" : "xl:col-start-1 xl:row-start-1",
              )}
            >
              {descriptionHtml ? (
                <div className="flex flex-col gap-3">
                  <Tag>&gt; full description</Tag>
                  {/* Full-bleed on a phone: the card's border + padding cost 32px of a
                      375px screen, which is the difference between ~41 and ~45
                      characters per line. */}
                  <div className="sm:border sm:border-border sm:bg-bg-card sm:p-6 sm:shadow-brut-md">
                    <div
                      className="vacancy-body"
                      dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
                <Link
                  href="/"
                  className="font-mono text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
                >
                  ← усі вакансії
                </Link>
                {vacancy.link ? (
                  <ApplyLink
                    vacancyId={vacancy.id}
                    sourceName={vacancy.source.displayName.trim()}
                  />
                ) : null}
              </div>
            </div>

            <VacancyRail
              vacancy={vacancy}
              similar={similar}
              roleHubSlug={roleHubSlug}
              role={role}
              className={cn(
                "min-w-0",
                hasSpecs
                  ? "lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1"
                  : "xl:col-start-2 xl:row-start-1",
                STICKY_RAIL,
              )}
            />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
