import Link from "next/link";
import type { NodeRef, VacancyDto } from "@/lib/api/vacancies";
import {
  EMPLOYMENT_LABELS,
  ENGAGEMENT_LABELS,
  ENGLISH_LABELS,
  WORK_FORMAT_LABELS,
  formatExperience,
  formatSalary,
} from "@/lib/extracted-vacancy";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/ui-kit";
import { SeniorityBadge } from "@/components/data/SeniorityBadge";
import { Fact } from "../../_components/Fact";
import { FlagPills } from "../../_components/FlagPills";

export function VacancyCard({
  vacancy,
  className,
}: {
  vacancy: VacancyDto;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "flex w-full flex-col gap-6 border border-accent bg-bg-card p-6 shadow-[10px_10px_0_0_#000]",
        className,
      )}
    >
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <MetaTags vacancy={vacancy} />
          <Title vacancy={vacancy} />
          <KeyFacts vacancy={vacancy} />
          <SkillsList skills={vacancy.skills} />
          <FlagPills
            hasTestAssignment={vacancy.hasTestAssignment}
            hasReservation={vacancy.hasReservation}
          />
        </div>

        <Sidebar vacancy={vacancy} />
      </div>

      <Footer vacancy={vacancy} />
    </article>
  );
}

// ─── meta row ────────────────────────────────────────────────────────────

function MetaTags({ vacancy }: { vacancy: VacancyDto }) {
  const items: string[] = [];
  if (vacancy.workFormat)
    items.push(`[${WORK_FORMAT_LABELS[vacancy.workFormat]}]`);
  if (vacancy.employmentType)
    items.push(`[${EMPLOYMENT_LABELS[vacancy.employmentType]}]`);
  if (vacancy.engagementType)
    items.push(`[${ENGAGEMENT_LABELS[vacancy.engagementType]}]`);
  const loc = formatLocations(vacancy.locations);
  if (loc) items.push(`[${loc}]`);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-text-muted">
      <span className="text-accent">[{vacancy.source.code}]</span>
      {items.map((s) => (
        <span key={s}>{s}</span>
      ))}
      <span className="ml-auto">{formatRelative(vacancy.publishedAt)}</span>
    </div>
  );
}

// ─── title ───────────────────────────────────────────────────────────────

function Title({ vacancy }: { vacancy: VacancyDto }) {
  const role = vacancy.role?.name ?? "роль не визначено";
  const subtitle = vacancy.company?.name ?? vacancy.source.displayName;
  const domain = vacancy.domain?.name ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-3">
        {vacancy.seniority ? (
          <SeniorityBadge seniority={vacancy.seniority} />
        ) : null}
        <h3
          className="break-words font-mono text-xl font-bold leading-tight text-text-primary md:text-2xl"
          title={vacancy.title}
        >
          {role}
        </h3>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-body text-sm text-text-secondary">
          {subtitle}
        </span>
        {domain ? (
          <span className="font-mono text-xs text-text-muted">[{domain}]</span>
        ) : null}
        {vacancy.link ? (
          <a
            href={vacancy.link}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-xs text-accent hover:underline"
          >
            ↗ відкрити
          </a>
        ) : null}
      </div>
    </div>
  );
}

// ─── key facts (salary / english / experience) ──────────────────────────

function KeyFacts({ vacancy }: { vacancy: VacancyDto }) {
  const salary = formatSalary(vacancy.salary);
  const english = vacancy.englishLevel
    ? ENGLISH_LABELS[vacancy.englishLevel]
    : null;
  const exp = formatExperience(vacancy.experienceYears);

  if (!salary && !english && !exp) return null;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {salary ? <Fact label="зарплата" value={salary} highlight /> : null}
      {english ? <Fact label="англійська" value={english} /> : null}
      {exp ? <Fact label="досвід" value={exp} /> : null}
    </div>
  );
}

// ─── skills ──────────────────────────────────────────────────────────────

function SkillsList({ skills }: { skills: VacancyDto["skills"] }) {
  if (skills.required.length === 0 && skills.optional.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {skills.required.length > 0 ? (
        <SkillsRow label="обов'язкові" items={skills.required} tone="required" />
      ) : null}
      {skills.optional.length > 0 ? (
        <SkillsRow
          label="бажані"
          items={skills.optional}
          tone="optional"
        />
      ) : null}
    </div>
  );
}

function SkillsRow({
  label,
  items,
  tone,
}: {
  label: string;
  items: NodeRef[];
  tone: "required" | "optional";
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {label}:
      </span>
      {items.map((s) => (
        <span
          key={s.id}
          className={cn(
            "border px-2 py-[2px] font-mono text-xs",
            tone === "required"
              ? "border-accent text-accent"
              : "border-border text-text-secondary",
          )}
        >
          #{s.name.toLowerCase()}
        </span>
      ))}
    </div>
  );
}

// ─── sidebar (apply CTA) ────────────────────────────────────────────────

function Sidebar({ vacancy }: { vacancy: VacancyDto }) {
  return (
    <div className="flex w-full flex-col gap-3 md:w-[240px] md:flex-shrink-0">
      <div className="flex flex-col gap-2 border border-accent bg-bg-elev p-4">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-accent">
          &gt; джерело
        </span>
        <span className="font-mono text-sm font-bold text-text-primary">
          {vacancy.source.displayName}
        </span>
        <span className="font-mono text-[11px] text-text-muted">
          завантажено {formatRelative(vacancy.loadedAt)}
        </span>
      </div>

      {vacancy.link ? (
        <a
          href={vacancy.link}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center justify-center gap-2 border border-accent bg-bg px-4 py-[10px] font-body text-xs text-text-primary shadow-[4px_4px_0_0_#000] transition-[transform,box-shadow] hover:shadow-[2px_2px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px]"
        >
          <span className="text-accent">↗</span> відкрити оригінал
        </a>
      ) : (
        <span className="flex items-center justify-center gap-2 border border-border bg-bg px-4 py-[10px] font-body text-xs text-text-muted">
          посилання недоступне
        </span>
      )}
      <Link
        href={`/dashboard/records/${vacancy.rssRecordId}`}
        className="flex items-center justify-center gap-2 border border-border bg-bg px-4 py-[10px] font-body text-xs text-text-secondary shadow-[3px_3px_0_0_#000] transition-[transform,box-shadow] hover:border-accent hover:text-text-primary hover:shadow-[1px_1px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px]"
      >
        <span className="text-text-muted">⌥</span> вихідний запис
      </Link>
    </div>
  );
}

// ─── footer ──────────────────────────────────────────────────────────────

function Footer({ vacancy }: { vacancy: VacancyDto }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 font-mono text-[11px] uppercase tracking-wider">
      <span className="font-bold text-accent">&gt; ідентифікатори:</span>
      <span className="inline-flex items-center gap-2 text-text-muted">
        внутрішній
        <CopyButton value={vacancy.id} ariaLabel="скопіювати ідентифікатор вакансії" />
      </span>
      <span className="inline-flex items-center gap-2 text-text-muted">
        зовнішній
        <CopyButton
          value={vacancy.externalId}
          ariaLabel="скопіювати зовнішній ідентифікатор"
        />
      </span>
      <Link
        href={`/dashboard/records/${vacancy.rssRecordId}`}
        className="inline-flex items-center gap-1 text-text-secondary hover:text-accent"
      >
        <span className="text-accent">↗</span> сирий RSS-запис
      </Link>
      <span className="ml-auto text-text-muted">
        loaded · {formatRelative(vacancy.loadedAt)}
      </span>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────

const LOCATIONS_MAX = 2;

function formatLocations(locations: string[]): string | null {
  if (locations.length === 0) return null;
  if (locations.length <= LOCATIONS_MAX) return locations.join(" · ");
  return `${locations.slice(0, LOCATIONS_MAX).join(" · ")} · +${locations.length - LOCATIONS_MAX}`;
}
