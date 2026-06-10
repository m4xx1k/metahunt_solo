import { Fragment } from "react";

import Link from "next/link";

import { DuplicatesBadge } from "./DuplicatesBadge";
import { SeniorityBadge } from "./SeniorityBadge";
import { SkillChip } from "@/entities/skill/SkillChip";
import { Fact } from "./Fact";
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

  const metaItems: React.ReactNode[] = [];
  if (v.workFormat)
    metaItems.push(
      <span key="format">{WORK_FORMAT_LABELS[v.workFormat]}</span>,
    );
  if (v.employmentType)
    metaItems.push(
      <span key="employment">{EMPLOYMENT_LABELS[v.employmentType]}</span>,
    );
  if (loc)
    metaItems.push(
      <span key="loc" className="inline-flex items-center gap-1">
        <span aria-hidden>📍</span>
        {loc}
      </span>,
    );
  if (english) metaItems.push(<span key="english">{english}</span>);
  if (experience) metaItems.push(<span key="experience">{experience}</span>);

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

  const reservationPill =
    v.hasReservation === true ? (
      <FlagPill icon="🛡" label="бронь" value="так" tone="ok" />
    ) : null;
  const testPill =
    v.hasTestAssignment === true ? (
      <FlagPill icon="🧪" label="test" value="yes" tone="warn" />
    ) : v.hasTestAssignment === false ? (
      <FlagPill icon="🧪" label="test" value="no" tone="ok" />
    ) : null;
  const hasAnyPill = reservationPill !== null || testPill !== null;

  return (
    <article className="flex w-full flex-col gap-4 border border-border bg-bg-card p-6 transition-colors hover:border-accent md:flex-row md:gap-8">
      {/* MAIN — role / meta / salary / skills / footer */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {v.seniority ? (
            <SeniorityBadge
              seniority={v.seniority}
              className="text-xs px-3 py-1 tracking-[0.15em]"
            />
          ) : null}
          <h3 className="break-words font-mono text-xl font-bold leading-tight text-text-primary md:text-2xl">
            {role}
          </h3>
          {v.duplicateCount && v.uniqueVacancyId ? (
            <DuplicatesBadge
              uniqueVacancyId={v.uniqueVacancyId}
              count={v.duplicateCount}
              sourceCount={v.duplicateSourceCount ?? 1}
            />
          ) : null}
        </div>

        {/* Mobile-only inline aside strip — replaces the desktop right column */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs md:hidden">
          <span className="font-bold text-accent">{sourceName}</span>
          {company ? (
            <>
              <span className="text-text-muted">·</span>
              <span className="text-text-primary">{company}</span>
            </>
          ) : null}
          {domain ? (
            <>
              <span className="text-text-muted">·</span>
              <span className="border border-border px-2 py-[1px] text-[11px] text-text-secondary">
                [{domain}]
              </span>
            </>
          ) : null}
        </div>

        {/* Mobile-only pills row */}
        {hasAnyPill ? (
          <div className="flex flex-wrap gap-2 md:hidden">
            {reservationPill}
            {testPill}
          </div>
        ) : null}

        {metaItems.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-text-muted">
            {metaItems.map((item, i) => (
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

        {salary ? (
          <span className="inline-flex items-center gap-2 font-mono text-base font-bold text-success">
            <span aria-hidden>💰</span>
            {salary}
          </span>
        ) : null}

        {requiredSkills.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              must-have:
            </span>
            {requiredSkills.map((s: NodeRef) => (
              <SkillChip key={s.id} name={s.name} tone="required" />
            ))}
            {extraRequired > 0 ? (
              <span className="font-mono text-xs text-text-muted">
                +{extraRequired}
              </span>
            ) : null}
          </div>
        ) : null}

        {optionalSkills.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              nice-to-have:
            </span>
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

        <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-border pt-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
            posted {formatRelative(v.publishedAt)}
          </span>
          <div className="flex items-center gap-4">
            {v.link ? (
              <a
                href={v.link}
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-sm text-accent hover:underline"
              >
                ↗ open original
              </a>
            ) : null}
            <Link
              href={`/records/${v.rssRecordId}`}
              className="font-mono text-sm text-text-secondary hover:text-accent hover:underline"
            >
              ⌥ source record
            </Link>
          </div>
        </div>
      </div>

      {/* DESKTOP-ONLY ASIDE — source / company / domain / pills */}
      <aside className="hidden md:flex md:w-[160px] md:flex-shrink-0 md:flex-col md:gap-4 md:border-l md:border-border md:pl-6">
        <Fact label="on" value={sourceName} valueClass="text-sm font-bold text-accent" />
        {company ? (
          <Fact label="company" value={company} valueClass="text-sm font-body text-text-primary" />
        ) : null}
        {domain ? (
          <Fact label="domain">
            <span className="w-fit border border-border px-2 py-[2px] font-mono text-xs text-text-secondary">
              [{domain}]
            </span>
          </Fact>
        ) : null}

        {hasAnyPill ? (
          <div className="mt-auto flex flex-col gap-2 pt-2">
            {reservationPill}
            {testPill}
          </div>
        ) : null}
      </aside>
    </article>
  );
}
