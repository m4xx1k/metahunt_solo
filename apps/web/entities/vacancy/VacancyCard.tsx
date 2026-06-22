import { Fragment } from "react";

import { DuplicatesBadge } from "./DuplicatesBadge";
import { SeniorityBadge } from "./SeniorityBadge";
import { SkillChip } from "@/entities/skill/SkillChip";
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
import type { NodeRef, VacancyDto } from "@/lib/api/vacancies";

type Props = { vacancy: VacancyDto };

const SKILLS_REQUIRED_SHOWN = 6;
const SKILLS_OPTIONAL_SHOWN = 5;

// Variant B: one reflowing card, ranked by what a candidate scans. Eight
// meaning-groups, grouped by space, never by Label:Value. The role is the one
// focal point (won by quieting competitors, not enlarging); colour budget is
// green=salary, accent=seniority+required skills+years, all else neutral.
// Top = main column (groups 1–5) + a narrow provenance rail (6); a full-width
// footer carries flags (7, left) and posted/apply (8, right).
export function VacancyCard({ vacancy: v }: Props) {
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

  // Group 1 — eyebrow: logistics only (format · employment · location).
  const eyebrow: React.ReactNode[] = [];
  if (v.workFormat)
    eyebrow.push(<span key="format">{WORK_FORMAT_LABELS[v.workFormat]}</span>);
  if (v.employmentType)
    eyebrow.push(
      <span key="employment">{EMPLOYMENT_LABELS[v.employmentType]}</span>,
    );
  if (loc)
    eyebrow.push(
      <span key="loc" className="inline-flex items-center gap-1">
        <span aria-hidden>📍</span>
        {loc}
      </span>,
    );

  const requiredSkills = v.skills.required.slice(0, SKILLS_REQUIRED_SHOWN);
  const extraRequired = Math.max(
    0,
    v.skills.required.length - SKILLS_REQUIRED_SHOWN,
  );
  const optionalSkills = v.skills.optional.slice(0, SKILLS_OPTIONAL_SHOWN);
  const extraOptional = Math.max(
    0,
    v.skills.optional.length - SKILLS_OPTIONAL_SHOWN,
  );
  const hasSkills = requiredSkills.length > 0 || optionalSkills.length > 0;

  return (
    <article className="flex w-full flex-col gap-5 border border-border bg-bg-card p-6 transition-colors hover:border-accent">
      {/* TOP — main column (1–5) + provenance rail (6) */}
      <div className="flex flex-col gap-5 md:flex-row md:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* 1 — eyebrow */}
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

          {/* 2 — headline: outline seniority before the role (never filled) */}
          <div className="flex flex-wrap items-center gap-3">
            {v.seniority ? (
              <SeniorityBadge
                seniority={v.seniority}
                outline
                className="px-3 py-1 tracking-[0.15em]"
              />
            ) : null}
            <h3 className="break-words font-mono text-lg font-bold leading-tight text-text-primary md:text-xl">
              {role}
            </h3>
          </div>

          {/* 3 — requirements: years (accent chip) + english (plain) */}
          {experience || english ? (
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
              {experience ? (
                <span className="border border-accent bg-accent-subtle-bg px-2 py-[2px] font-bold text-accent">
                  {experience}
                </span>
              ) : null}
              {english ? (
                <span className="text-text-secondary">{english}</span>
              ) : null}
            </div>
          ) : null}

          {/* 4 — salary: the one green fact */}
          {salary ? (
            <span className="font-mono text-base font-bold text-success">
              {salary}
            </span>
          ) : null}

          {/* 5 — skills: colour is the label (required = accent, optional = muted) */}
          {hasSkills ? (
            <div className="flex flex-wrap items-center gap-2">
              {requiredSkills.map((s: NodeRef) => (
                <SkillChip key={s.id} name={s.name} tone="required" />
              ))}
              {extraRequired > 0 ? (
                <span className="font-mono text-xs text-text-muted">
                  +{extraRequired}
                </span>
              ) : null}
              {optionalSkills.map((s: NodeRef) => (
                <SkillChip key={s.id} name={s.name} tone="optional" />
              ))}
              {extraOptional > 0 ? (
                <span className="font-mono text-xs text-text-muted">
                  +{extraOptional}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* 6 — provenance rail: company · domain (source moved to apply) */}
        {company || domain ? (
          <aside className="flex flex-col gap-3 md:w-[160px] md:flex-shrink-0 md:border-l md:border-border md:pl-6">
            {company ? (
              <div className="flex flex-col gap-1">
                <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
                  company
                </span>
                <span className="font-mono text-xs text-text-primary">
                  {company}
                </span>
              </div>
            ) : null}
            {domain ? (
              <div className="flex flex-col gap-1">
                <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
                  domain
                </span>
                <span className="w-fit border border-border px-2 py-[2px] font-mono text-xs text-text-secondary">
                  [{domain}]
                </span>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>

      {/* FOOTER — flags (left) · posted + apply (right) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {v.hasTestAssignment === true ? (
            <FlagPill value="тестове" tone="muted" />
          ) : null}
          {v.hasReservation === true ? (
            <FlagPill value="бронь" tone="muted" />
          ) : null}
          {v.duplicateCount && v.uniqueVacancyId ? (
            <DuplicatesBadge
              uniqueVacancyId={v.uniqueVacancyId}
              count={v.duplicateCount}
              sourceCount={v.duplicateSourceCount ?? 1}
            />
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
            posted {formatRelative(v.publishedAt)}
          </span>
          {v.link ? (
            <a
              href={v.link}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono text-sm text-accent hover:underline"
            >
              ↗ оригінал на {sourceName}
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
