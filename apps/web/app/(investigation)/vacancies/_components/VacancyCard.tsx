import type { NodeRef, VacancyDto } from "@/lib/api/vacancies";
import {
  EMPLOYMENT_LABELS,
  ENGAGEMENT_LABELS,
  ENGLISH_LABELS,
  SENIORITY_LABELS,
  WORK_FORMAT_LABELS,
  formatExperience,
  formatSalary,
} from "@/lib/extracted-vacancy";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

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
          <FlagPills vacancy={vacancy} />
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
  const seniorityPrefix = vacancy.seniority
    ? SENIORITY_LABELS[vacancy.seniority].toUpperCase()
    : null;
  const role = vacancy.role?.name ?? "untitled role";
  const headline = seniorityPrefix ? `${seniorityPrefix} · ${role}` : role;
  const subtitle = vacancy.company?.name ?? vacancy.source.displayName;
  const domain = vacancy.domain?.name ?? null;

  return (
    <div className="flex flex-col gap-1">
      <h3
        className="break-words font-mono text-xl font-bold leading-tight text-text-primary md:text-2xl"
        title={vacancy.title}
      >
        {headline}
      </h3>
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
            ↗ open
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
      {salary ? <Fact label="salary" value={salary} highlight /> : null}
      {english ? <Fact label="english" value={english} /> : null}
      {exp ? <Fact label="experience" value={exp} /> : null}
    </div>
  );
}

function Fact({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <span
        className={cn(
          "font-mono",
          highlight
            ? "text-success text-base font-bold"
            : "text-text-primary text-[13px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ─── skills ──────────────────────────────────────────────────────────────

function SkillsList({ skills }: { skills: VacancyDto["skills"] }) {
  if (skills.required.length === 0 && skills.optional.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {skills.required.length > 0 ? (
        <SkillsRow label="must-have" items={skills.required} tone="required" />
      ) : null}
      {skills.optional.length > 0 ? (
        <SkillsRow
          label="nice-to-have"
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

// ─── flag pills (test / бронь) ──────────────────────────────────────────

function FlagPills({ vacancy }: { vacancy: VacancyDto }) {
  const pills: Array<{
    label: string;
    value: string;
    tone: "ok" | "no" | "muted";
  }> = [];

  if (vacancy.hasTestAssignment === true) {
    pills.push({ label: "test task", value: "yes", tone: "no" });
  } else if (vacancy.hasTestAssignment === false) {
    pills.push({ label: "test task", value: "no", tone: "ok" });
  }
  if (vacancy.hasReservation === true) {
    pills.push({ label: "бронь", value: "так", tone: "ok" });
  }

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((p) => (
        <span
          key={p.label}
          className={cn(
            "inline-flex items-center gap-2 border px-3 py-1 font-mono text-xs",
            p.tone === "ok" && "border-success text-success",
            p.tone === "no" && "border-danger text-danger",
            p.tone === "muted" && "border-border text-text-secondary",
          )}
        >
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            {p.label}:
          </span>
          <span className="font-bold">{p.value}</span>
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
          &gt; apply on
        </span>
        <span className="font-mono text-sm font-bold text-text-primary">
          {vacancy.source.displayName}
        </span>
        <span className="font-mono text-[11px] text-text-muted">
          loaded {formatRelative(vacancy.loadedAt)}
        </span>
      </div>

      {vacancy.link ? (
        <a
          href={vacancy.link}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center justify-center gap-2 border border-accent bg-bg px-4 py-[10px] font-body text-xs text-text-primary shadow-[4px_4px_0_0_#000] transition-[transform,box-shadow] hover:shadow-[2px_2px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px]"
        >
          <span className="text-accent">↗</span> open original
        </a>
      ) : (
        <span className="flex items-center justify-center gap-2 border border-border bg-bg px-4 py-[10px] font-body text-xs text-text-muted">
          link unavailable
        </span>
      )}
    </div>
  );
}

// ─── footer ──────────────────────────────────────────────────────────────

function Footer({ vacancy }: { vacancy: VacancyDto }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 font-mono text-[11px] uppercase tracking-wider">
      <span className="font-bold text-accent">&gt; ids:</span>
      <span className="text-text-muted">
        vacancy · <span className="text-text-secondary">{vacancy.id}</span>
      </span>
      <span className="text-text-muted">·</span>
      <span className="text-text-muted">
        external ·{" "}
        <span className="text-text-secondary">{vacancy.externalId}</span>
      </span>
      <span className="ml-auto text-text-muted">
        published · {formatDateTime(vacancy.publishedAt)}
      </span>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────

function formatLocations(locations: string[]): string | null {
  if (locations.length === 0) return null;
  return locations.join(" · ");
}
