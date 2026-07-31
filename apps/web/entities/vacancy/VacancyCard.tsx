import { Fragment } from "react";

import Link from "next/link";
import { ClipboardList, ShieldCheck } from "lucide-react";

import { DuplicatesBadge } from "./DuplicatesBadge";
import { SeniorityBadge } from "./SeniorityBadge";
import { VacancySkills, type VacancyMatch } from "./VacancySkills";
import { FlagPill } from "./FlagPill";
import { formatLocations } from "./format-locations";
import {
  EMPLOYMENT_LABELS,
  ENGLISH_LABELS,
  WORK_FORMAT_LABELS,
  formatExperience,
  formatSalary,
} from "@/lib/extracted-vacancy";
import { formatRelative } from "@/lib/format";
import { vacancyPath } from "@/lib/seo/vacancy-url";
import type { VacancyDto } from "@/lib/api/vacancies";

import { ApplyLink } from "./ApplyLink";

type Props = {
  vacancy: VacancyDto;
  match?: VacancyMatch;
  feedbackSlot?: React.ReactNode;
};

export function VacancyCard({ vacancy: v, match, feedbackSlot }: Props) {
  const role = v.role?.name ?? "untitled role";
  const company = v.company?.name ?? null;
  const domain = v.domain?.name ?? null;
  const sourceName = v.source.displayName.trim();
  const english = v.englishLevel ? ENGLISH_LABELS[v.englishLevel] : null;
  const experience = formatExperience(v.experienceYears);
  const salary = formatSalary({
    min: v.salary.min,
    max: v.salary.max,
    currency: v.salary.currency,
  });
  const loc = formatLocations(v.locations);

  const eyebrow: React.ReactNode[] = [];
  if (v.workFormat) eyebrow.push(<span key="format">{WORK_FORMAT_LABELS[v.workFormat]}</span>);
  if (v.employmentType)
    eyebrow.push(<span key="employment">{EMPLOYMENT_LABELS[v.employmentType]}</span>);
  if (loc)
    eyebrow.push(
      <span key="loc" className="inline-flex items-center gap-1">
        <span aria-hidden>📍</span>
        {loc}
      </span>,
    );

  return (
    <article className="flex w-full flex-col gap-3 border border-border bg-bg-card p-4 transition-colors hover:border-accent">
      <div className="flex flex-col gap-3 md:flex-row md:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {eyebrow.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-2xs uppercase tracking-wider text-text-muted">
              {eyebrow.map((item, i) => (
                <Fragment key={i}>
                  {i > 0 ? (
                    <span aria-hidden className="text-text-muted/60">
                      ·
                    </span>
                  ) : null}
                  {item}
                </Fragment>
              ))}
            </div>
          ) : null}

          {/* 2 — headline: outline seniority before the role (never filled).
              The role links to the detail page — without this the feed's only
              outbound link is the external apply, and every /vacancy/* page is
              an orphan no crawler can reach. */}
          <div className="flex flex-wrap items-center gap-3">
            {v.seniority ? (
              <SeniorityBadge
                seniority={v.seniority}
                outline
                className="px-3 py-1 tracking-[0.15em]"
              />
            ) : null}
            <h3 className="break-words font-mono text-lg font-bold leading-tight text-text-primary md:text-xl">
              <Link
                href={vacancyPath({ id: v.id, roleName: v.role?.name, title: v.title })}
                className="transition-colors hover:text-accent hover:underline"
              >
                {role}
              </Link>
            </h3>
          </div>

          {experience || english ? (
            <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
              {experience ? (
                <span className="font-bold uppercase tracking-wider text-accent">{experience}</span>
              ) : null}
              {english ? <span className="text-text-secondary">{english}</span> : null}
            </div>
          ) : null}

          {salary ? (
            <span className="font-mono text-base font-bold text-success">{salary}</span>
          ) : null}

          <VacancySkills required={v.skills.required} optional={v.skills.optional} match={match} />
        </div>

        {company || domain ? (
          <aside className="flex min-w-0 flex-col gap-3 md:w-[132px] md:flex-shrink-0 md:border-l md:border-border md:pl-4">
            {company ? (
              <div className="flex flex-col gap-1">
                <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
                  company
                </span>
                <span className="break-words font-mono text-xs text-text-primary">{company}</span>
              </div>
            ) : null}
            {domain ? (
              <div className="flex flex-col gap-1">
                <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
                  domain
                </span>
                <span className="w-fit max-w-full break-words border border-border-strong bg-bg-elev px-2.5 py-1 font-mono text-xs font-medium text-text-primary">
                  {domain}
                </span>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {v.hasTestAssignment === true ? (
            <FlagPill
              icon={<ClipboardList className="h-3.5 w-3.5" strokeWidth={2.5} />}
              value="test task"
              tone="info"
            />
          ) : null}
          {v.hasReservation === true ? (
            <FlagPill
              icon={<ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} />}
              value="reservation"
              tone="ok"
            />
          ) : null}
          {v.duplicateCount && v.uniqueVacancyId ? (
            <DuplicatesBadge
              uniqueVacancyId={v.uniqueVacancyId}
              count={v.duplicateCount}
              sourceCount={v.duplicateSourceCount ?? 1}
            />
          ) : null}
          {feedbackSlot}
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
            posted {formatRelative(v.publishedAt)}
          </span>
          {v.link ? (
            // Route through our `/go/:id` redirect (not straight to source) so
            // every apply tap passes through metahunt and gets logged.
            <ApplyLink vacancyId={v.id} sourceName={sourceName} />
          ) : null}
        </div>
      </div>
    </article>
  );
}
