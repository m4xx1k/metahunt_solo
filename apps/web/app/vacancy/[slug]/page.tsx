import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import sanitizeHtml from "sanitize-html";

import { Footer } from "@/app/_components/Footer";
import { Header } from "@/app/_components/Header";
import { ApplyLink } from "@/entities/vacancy/ApplyLink";
import { DuplicatesBadge } from "@/entities/vacancy/DuplicatesBadge";
import { Fact } from "@/entities/vacancy/Fact";
import { FlagPills } from "@/entities/vacancy/FlagPills";
import { formatLocations } from "@/entities/vacancy/format-locations";
import { SeniorityBadge } from "@/entities/vacancy/SeniorityBadge";
import { VacancySkills } from "@/entities/vacancy/VacancySkills";
import { facetsApi, type NodeFacet } from "@/lib/api/facets";
import { vacanciesApi, type FeedDuplicateGroup, type VacancyDto } from "@/lib/api/vacancies";
import {
  EMPLOYMENT_LABELS,
  ENGAGEMENT_LABELS,
  ENGLISH_LABELS,
  SENIORITY_LABELS,
  WORK_FORMAT_LABELS,
  formatExperience,
  formatSalary,
} from "@/lib/extracted-vacancy";
import { formatRelative } from "@/lib/format";
import { breadcrumbJsonLd } from "@/lib/seo/breadcrumbs";
import { ROLE_HUB_MIN_VACANCIES } from "@/lib/seo/hub-meta";
import { buildJobPosting, isExpired } from "@/lib/seo/job-posting";
import { JsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { vacancyTitle } from "@/lib/seo/vacancy-meta";
import { parseVacancyId, vacancyPath } from "@/lib/seo/vacancy-url";
import { Tag } from "@/ui";

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
    if (err instanceof Error && err.message.includes(" 404 ")) return null;
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
  const company = vacancy.company?.name ?? null;
  const domain = vacancy.domain?.name ?? null;
  const english = vacancy.englishLevel ? ENGLISH_LABELS[vacancy.englishLevel] : null;
  const experience = formatExperience(vacancy.experienceYears);
  const salary = formatSalary({
    min: vacancy.salary.min,
    max: vacancy.salary.max,
    currency: vacancy.salary.currency,
  });
  const loc = formatLocations(vacancy.locations);
  const isDeduped = Boolean(vacancy.duplicateCount && vacancy.duplicateCount > 1);
  const descriptionHtml = vacancy.description
    ? sanitizeHtml(vacancy.description, DESCRIPTION_SANITIZE_OPTIONS).trim()
    : "";

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
      <main
        className="bg-bg"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 50% 0%, rgba(255,179,128,0.08), transparent 70%), radial-gradient(var(--color-border) 1px, transparent 1px)",
          backgroundSize: "auto, 22px 22px",
        }}
      >
        <section className="border-b border-border px-6 py-16 md:px-12 md:py-20">
          <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-2xs uppercase tracking-wider text-text-muted">
              <Tag>&gt; {vacancy.source.displayName.trim()}</Tag>
              {vacancy.workFormat ? <span>{WORK_FORMAT_LABELS[vacancy.workFormat]}</span> : null}
              {vacancy.employmentType ? (
                <span>· {EMPLOYMENT_LABELS[vacancy.employmentType]}</span>
              ) : null}
              {loc ? <span>· 📍 {loc}</span> : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {vacancy.seniority ? (
                <SeniorityBadge
                  seniority={vacancy.seniority}
                  outline
                  className="px-3 py-1 tracking-[0.15em]"
                />
              ) : null}
              <h1 className="break-words font-display text-3xl font-black leading-tight text-text-primary md:text-5xl">
                {role}
              </h1>
            </div>

            {company ? <p className="font-mono text-lg text-text-secondary">{company}</p> : null}

            {salary ? (
              <span className="font-mono text-2xl font-bold text-success">{salary}</span>
            ) : null}

            {/* The whole reason this page exists: the dedup hero stat. */}
            {isDeduped ? (
              <div className="flex flex-col gap-2 border-2 border-accent bg-accent-subtle-bg p-5 shadow-brut">
                <span className="font-mono text-2xs uppercase tracking-wider text-accent">
                  semantic dedup
                </span>
                <p className="font-display text-xl font-bold leading-snug text-text-primary sm:text-2xl">
                  Reposted {vacancy.duplicateCount}× across{" "}
                  {sourceNames.length > 0
                    ? sourceNames.join(" + ")
                    : `${vacancy.duplicateSourceCount ?? 1} sources`}{" "}
                  — deduped to one listing.
                </p>
                <p className="text-sm leading-relaxed text-text-secondary">
                  metahunt matched {vacancy.duplicateCount} postings of this exact role by semantic
                  similarity, so you see it once instead of {vacancy.duplicateCount} times.
                </p>
                {vacancy.uniqueVacancyId ? (
                  <div className="pt-1">
                    <DuplicatesBadge
                      uniqueVacancyId={vacancy.uniqueVacancyId}
                      count={vacancy.duplicateCount ?? 1}
                      sourceCount={vacancy.duplicateSourceCount ?? 1}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Apply CTA — the one action this page drives toward. */}
            {vacancy.link ? (
              <div className="flex flex-wrap items-center justify-between gap-4 border border-border-strong bg-bg-card p-5 shadow-brut-sm">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
                    posted {formatRelative(vacancy.publishedAt)}
                  </span>
                  <span className="font-mono text-sm text-text-secondary">
                    via {vacancy.source.displayName.trim()}
                  </span>
                </div>
                <ApplyLink vacancyId={vacancy.id} sourceName={vacancy.source.displayName.trim()} />
              </div>
            ) : null}

            <FlagPills
              hasTestAssignment={vacancy.hasTestAssignment}
              hasReservation={vacancy.hasReservation}
            />
          </div>
        </section>

        <section className="px-6 py-12 md:px-12">
          <div className="mx-auto flex w-full max-w-[880px] flex-col gap-10">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {english ? <FactBox label="english" value={english} /> : null}
              {experience ? <FactBox label="experience" value={experience} /> : null}
              {vacancy.engagementType ? (
                <FactBox label="engagement" value={ENGAGEMENT_LABELS[vacancy.engagementType]} />
              ) : null}
              {domain ? <FactBox label="domain" value={domain} /> : null}
              {loc ? <FactBox label="location" value={loc} /> : null}
              <FactBox label="last updated" value={formatRelative(vacancy.updatedAt)} />
            </div>

            {vacancy.skills.required.length > 0 || vacancy.skills.optional.length > 0 ? (
              <div className="flex flex-col gap-3">
                <Tag>&gt; skills</Tag>
                <VacancySkills
                  required={vacancy.skills.required}
                  optional={vacancy.skills.optional}
                />
              </div>
            ) : null}

            {descriptionHtml ? (
              <div className="flex flex-col gap-3">
                <Tag>&gt; full description</Tag>
                <div className="border border-border bg-bg-card p-6 shadow-brut-md">
                  <div
                    className="vacancy-body"
                    dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                  />
                </div>
              </div>
            ) : null}

            {roleHubSlug || vacancy.company?.slug ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-6">
                <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
                  дивитись також:
                </span>
                {roleHubSlug ? (
                  <Link
                    href={`/role/${roleHubSlug}`}
                    className="border border-border bg-bg-card px-3 py-1.5 font-mono text-xs text-text-secondary transition-colors hover:border-accent hover:text-accent"
                  >
                    усі вакансії {role}
                  </Link>
                ) : null}
                {vacancy.company?.slug ? (
                  <Link
                    href={`/company/${vacancy.company.slug}`}
                    className="border border-border bg-bg-card px-3 py-1.5 font-mono text-xs text-text-secondary transition-colors hover:border-accent hover:text-accent"
                  >
                    вакансії в {vacancy.company.name}
                  </Link>
                ) : null}
              </div>
            ) : null}

            {similar.length > 0 ? (
              <div className="flex flex-col gap-3">
                <Tag>&gt; схожі вакансії</Tag>
                <ul className="flex flex-col">
                  {similar.map((s) => (
                    <li key={s.id} className="border-b border-border last:border-b-0">
                      <Link
                        href={vacancyPath({ id: s.id, roleName: s.role?.name, title: s.title })}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 transition-colors hover:text-accent"
                      >
                        <span className="font-mono text-sm text-text-primary">
                          {s.role?.name ?? s.title}
                        </span>
                        <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
                          {s.company?.name ?? s.source.displayName.trim()}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
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
                <ApplyLink vacancyId={vacancy.id} sourceName={vacancy.source.displayName.trim()} />
              ) : null}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function FactBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-bg-card p-4">
      <Fact label={label} value={value} />
    </div>
  );
}
