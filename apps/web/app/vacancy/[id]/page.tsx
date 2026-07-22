import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { vacanciesApi, type FeedDuplicateGroup, type VacancyDto } from "@/lib/api/vacancies";
import {
  EMPLOYMENT_LABELS,
  ENGAGEMENT_LABELS,
  ENGLISH_LABELS,
  WORK_FORMAT_LABELS,
  formatExperience,
  formatSalary,
} from "@/lib/extracted-vacancy";
import { formatRelative } from "@/lib/format";
import { Tag } from "@/ui";

const SITE_URL = "https://www.metahunt.app";

export const dynamic = "force-dynamic";

type PageParams = { id: string };

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

// Any vacancy row 404s the same way (bad uuid or missing row) — the
// controller always throws NotFoundException, so this is the one place that
// tells "not found" apart from a real backend outage.
async function loadVacancy(id: string): Promise<VacancyDto | null> {
  return vacanciesApi.byId(id).catch((err) => {
    if (err instanceof Error && err.message.includes(" 404 ")) return null;
    throw err;
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { id } = await params;
  const vacancy = await loadVacancy(id);
  if (!vacancy) return {};

  const role = vacancy.role?.name ?? vacancy.title;
  const company = vacancy.company?.name;
  const url = `${SITE_URL}/vacancy/${id}`;
  const title = `${role}${company ? ` at ${company}` : ""} · metahunt`;

  const salary = formatSalary({
    min: vacancy.salary.min,
    max: vacancy.salary.max,
    currency: vacancy.salary.currency,
  });
  const dedupLine =
    vacancy.duplicateCount && vacancy.duplicateCount > 1
      ? ` Reposted ${vacancy.duplicateCount}× across ${vacancy.duplicateSourceCount ?? 1} sources — deduped to one listing by metahunt.`
      : "";
  const description = [
    `${role}${company ? ` at ${company}` : ""}.`,
    salary ? `${salary}.` : "",
    dedupLine,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "metahunt", type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function VacancyDetailPage({ params }: { params: Promise<PageParams> }) {
  const { id } = await params;
  const vacancy = await loadVacancy(id);
  if (!vacancy) notFound();

  // Named sources for the hero stat ("DOU + Djinni"); falls back to the bare
  // counter already on the vacancy DTO if the group fetch hiccups.
  const group = vacancy.uniqueVacancyId
    ? await vacanciesApi.group(vacancy.uniqueVacancyId).catch((): FeedDuplicateGroup | null => null)
    : null;
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

  return (
    <>
      <Header links={[{ label: "browse the feed", href: "/" }]} cta={null} />
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

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
              <Link
                href="/"
                className="font-mono text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
              >
                ← back to the feed
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
