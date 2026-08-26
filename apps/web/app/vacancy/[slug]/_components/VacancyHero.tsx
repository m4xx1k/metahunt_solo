import Link from "next/link";

import { DuplicatesBadge } from "@/entities/vacancy/DuplicatesBadge";
import { FlagPills } from "@/entities/vacancy/FlagPills";
import { SeniorityBadge } from "@/entities/vacancy/SeniorityBadge";
import { VacancySkills } from "@/entities/vacancy/VacancySkills";
import type { VacancyDto } from "@/lib/api/vacancies";
import { formatSalary } from "@/lib/extracted-vacancy";
import { Tag } from "@/ui";

import { VacancyMetaPills } from "./VacancyMetaPills";

export function VacancyHero({
  vacancy,
  role,
  sourceNames,
}: {
  vacancy: VacancyDto;
  role: string;
  // Named sources for the dedup stat ("DOU + Djinni"); empty when the group
  // fetch failed, and the bare counter carries the line instead.
  sourceNames: string[];
}) {
  const company = vacancy.company?.name ?? null;
  const companySlug = vacancy.company?.slug ?? null;
  const salary = formatSalary({
    min: vacancy.salary.min,
    max: vacancy.salary.max,
    currency: vacancy.salary.currency,
  });
  const isDeduped = Boolean(vacancy.duplicateCount && vacancy.duplicateCount > 1);

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5">
      <Tag>&gt; {vacancy.source.displayName.trim()}</Tag>

      <div className="flex flex-wrap items-center gap-3">
        {vacancy.seniority ? (
          // Grows with the H1 so the two read as one line on desktop: at md the
          // role is 48px and the base 10px badge sat at a third of its height.
          <SeniorityBadge
            seniority={vacancy.seniority}
            outline
            className="px-3 py-1 tracking-[0.15em] sm:px-4 sm:py-2 sm:text-xs md:px-5 md:py-1.5 md:text-xl"
          />
        ) : null}
        <h1 className="break-words font-display text-2xl font-black leading-tight text-text-primary sm:text-3xl md:text-5xl">
          {role}
        </h1>
      </div>

      {company ? (
        companySlug ? (
          <Link
            href={`/company/${companySlug}`}
            className="w-fit font-mono text-base text-text-secondary underline-offset-4 transition-colors hover:text-accent hover:underline md:text-lg"
          >
            {company}
          </Link>
        ) : (
          <p className="font-mono text-base text-text-secondary md:text-lg">{company}</p>
        )
      ) : null}

      {salary ? (
        <span className="font-mono text-xl font-bold text-success md:text-2xl">{salary}</span>
      ) : null}

      <VacancyMetaPills
        workFormat={vacancy.workFormat}
        employmentType={vacancy.employmentType}
        engagementType={vacancy.engagementType}
      />

      {/* Skills belong to the identity of a posting, not to its body — they are
          the fact people scan for right after the role and the money. */}
      <VacancySkills
        required={vacancy.skills.required}
        optional={vacancy.skills.optional}
        size="md"
        collapseOptional={false}
      />

      {/* The whole reason this page exists: the dedup hero stat. */}
      {isDeduped ? (
        <div className="flex max-w-[840px] flex-col gap-2 border-2 border-accent bg-accent-subtle-bg p-4 shadow-brut sm:p-5">
          <span className="font-mono text-2xs uppercase tracking-wider text-accent">
            semantic dedup
          </span>
          <p className="font-display text-lg font-bold leading-snug text-text-primary sm:text-2xl">
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

      <FlagPills
        hasTestAssignment={vacancy.hasTestAssignment}
        hasReservation={vacancy.hasReservation}
      />
    </div>
  );
}
