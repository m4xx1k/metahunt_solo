import { Fragment } from "react";

import Link from "next/link";

import { SeniorityBadge } from "@/components/data/SeniorityBadge";
import {
  EMPLOYMENT_LABELS,
  ENGLISH_LABELS,
  WORK_FORMAT_LABELS,
  formatExperience,
  formatSalary,
} from "@/lib/extracted-vacancy";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NodeRef, VacancyDto } from "@/lib/api/vacancies";

type Props = { vacancy: VacancyDto };

const LOCATIONS_MAX = 2;
const SKILLS_REQUIRED_SHOWN = 6;
const SKILLS_OPTIONAL_SHOWN = 5;

// Backend ships locations as strings like "Kyiv, Ukraine" (BAML splits city
// and country, but the wire contract collapses them). When every location
// shares the same country, render the country once at the end so we don't
// shout "Україна" five times for an all-UA posting.
function formatLocationsCapped(locations: string[]): string | null {
  if (locations.length === 0) return null;
  const parsed = locations.map((raw) => {
    const idx = raw.indexOf(",");
    if (idx === -1) return { city: raw.trim(), country: null as string | null };
    return { city: raw.slice(0, idx).trim(), country: raw.slice(idx + 1).trim() };
  });

  const sharedCountry =
    parsed.every((p) => p.country) &&
    new Set(parsed.map((p) => p.country)).size === 1
      ? parsed[0].country
      : null;

  const renderableItems = sharedCountry
    ? parsed.map((p) => p.city)
    : parsed.map((p) => (p.country ? `${p.city}, ${p.country}` : p.city));

  const head = renderableItems.slice(0, LOCATIONS_MAX).join(" · ");
  const overflow =
    renderableItems.length > LOCATIONS_MAX
      ? ` +${renderableItems.length - LOCATIONS_MAX}`
      : "";
  const suffix = sharedCountry ? `, ${sharedCountry}` : "";
  return `${head}${overflow}${suffix}`;
}

export function PublicVacancyCard({ vacancy: v }: Props) {
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
  const loc = formatLocationsCapped(v.locations);

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
        <div className="flex flex-wrap items-baseline gap-3">
          {v.seniority ? (
            <SeniorityBadge
              seniority={v.seniority}
              className="text-xs px-3 py-1 tracking-[0.15em]"
            />
          ) : null}
          <h3 className="break-words font-mono text-xl font-bold leading-tight text-text-primary md:text-2xl">
            {role}
          </h3>
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
              <span
                key={s.id}
                className="border border-accent px-2 py-[2px] font-mono text-xs text-accent"
              >
                #{s.name.toLowerCase()}
              </span>
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
              <span
                key={s.id}
                className="border border-border px-2 py-[2px] font-mono text-xs text-text-secondary"
              >
                #{s.name.toLowerCase()}
              </span>
            ))}
            {extraOptional > 0 ? (
              <span className="font-mono text-xs text-text-muted">
                +{extraOptional}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-3">
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
      <aside className="hidden md:flex md:w-[220px] md:flex-shrink-0 md:flex-col md:gap-4 md:border-l md:border-border md:pl-6">
        <SidebarFact label="on" value={sourceName} valueClass="font-bold text-accent" />
        {company ? (
          <SidebarFact label="company" value={company} valueClass="font-body text-text-primary" />
        ) : null}
        {domain ? (
          <SidebarFact label="domain">
            <span className="w-fit border border-border px-2 py-[2px] font-mono text-xs text-text-secondary">
              [{domain}]
            </span>
          </SidebarFact>
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

// ─── helpers ────────────────────────────────────────────────────────────

function SidebarFact({
  label,
  value,
  valueClass,
  children,
}: {
  label: string;
  value?: string;
  valueClass?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children ?? (
        <span className={cn("font-mono text-sm", valueClass)}>{value}</span>
      )}
    </div>
  );
}

function FlagPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  tone: "ok" | "warn";
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-2 border px-3 py-1 font-mono text-xs",
        tone === "ok" && "border-success text-success",
        tone === "warn" && "border-danger text-danger",
      )}
    >
      <span aria-hidden>{icon}</span>
      <span className="text-[10px] uppercase tracking-wider text-text-muted">
        {label}:
      </span>
      <span className="font-bold">{value}</span>
    </span>
  );
}
