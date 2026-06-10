import Link from "next/link";
import type { RecordListItem } from "@/lib/api/monitoring";
import {
  EMPLOYMENT_LABELS,
  ENGAGEMENT_LABELS,
  ENGLISH_LABELS,
  WORK_FORMAT_LABELS,
  displayTitle,
  formatExperience,
  formatLocations,
  formatSalary,
  safeExtracted,
  type ExtractedVacancy,
} from "@/lib/extracted-vacancy";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative } from "@/lib/format";
import { CopyButton } from "@/components/ui-kit";
import { SeniorityBadge } from "@/entities/vacancy/SeniorityBadge";
import { Fact } from "@/entities/vacancy/Fact";
import { FlagPills } from "@/entities/vacancy/FlagPills";

export function RssRecordCard({
  record,
  className,
}: {
  record: RecordListItem;
  className?: string;
}) {
  const ex = safeExtracted(record.extractedData);
  const extracted = record.extracted && ex !== null;

  return (
    <article
      className={cn(
        "flex w-full flex-col gap-6 bg-bg-card p-6 transition-shadow",
        extracted
          ? "border border-accent shadow-[10px_10px_0_0_#000]"
          : "border border-border shadow-[6px_6px_0_0_#000]",
        className,
      )}
    >
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <MetaTags record={record} ex={ex} />
          <Title record={record} ex={ex} />
          {ex ? <KeyFacts ex={ex} /> : null}
          {ex ? <SkillsList skills={ex.skills} /> : null}
          {ex ? (
            <FlagPills
              hasTestAssignment={ex.hasTestAssignment}
              hasReservation={ex.hasReservation}
            />
          ) : null}
          {record.description ? (
            <DescriptionDetails text={record.description} />
          ) : null}
        </div>

        <Sidebar record={record} ex={ex} />
      </div>

      <Footer record={record} />
    </article>
  );
}

// ─── meta row ────────────────────────────────────────────────────────────

function MetaTags({
  record,
  ex,
}: {
  record: RecordListItem;
  ex: ExtractedVacancy | null;
}) {
  const items: string[] = [];
  if (ex?.workFormat) items.push(`[${WORK_FORMAT_LABELS[ex.workFormat]}]`);
  if (ex?.employmentType)
    items.push(`[${EMPLOYMENT_LABELS[ex.employmentType]}]`);
  if (ex?.engagementType)
    items.push(`[${ENGAGEMENT_LABELS[ex.engagementType]}]`);
  const loc = formatLocations(ex?.locations);
  if (loc) items.push(`[${loc}]`);
  if (record.category && items.length === 0) {
    items.push(`[${record.category}]`);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-text-muted">
      <span className="text-accent">[{record.sourceCode ?? "src"}]</span>
      {items.map((s) => (
        <span key={s}>{s}</span>
      ))}
      <span className="ml-auto">{formatRelative(record.publishedAt)}</span>
    </div>
  );
}

// ─── title ───────────────────────────────────────────────────────────────

function Title({
  record,
  ex,
}: {
  record: RecordListItem;
  ex: ExtractedVacancy | null;
}) {
  const title = displayTitle(record);
  const subtitle = ex?.companyName ?? record.sourceDisplayName ?? null;
  const domain = ex?.domain ?? null;
  const seniority = ex?.seniority ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-3">
        {seniority ? <SeniorityBadge seniority={seniority} /> : null}
        <h3
          className="break-words font-mono text-xl font-bold leading-tight text-text-primary md:text-2xl"
          title={record.title}
        >
          {title}
        </h3>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {subtitle ? (
          <span className="font-body text-sm text-text-secondary">
            {subtitle}
          </span>
        ) : null}
        {domain ? (
          <span className="font-mono text-xs text-text-muted">
            [{domain}]
          </span>
        ) : null}
        {record.link ? (
          <a
            href={record.link}
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

// ─── facts grid (salary / english / experience) ──────────────────────────

function KeyFacts({ ex }: { ex: ExtractedVacancy }) {
  const salary = formatSalary(ex.salary);
  const english = ex.englishLevel ? ENGLISH_LABELS[ex.englishLevel] : null;
  const exp = formatExperience(ex.experienceYears);

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

function SkillsList({ skills }: { skills: ExtractedVacancy["skills"] }) {
  const required = skills?.required ?? [];
  const optional = skills?.optional ?? [];
  if (required.length === 0 && optional.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {required.length > 0 ? (
        <SkillsRow label="обов'язкові" items={required} tone="required" />
      ) : null}
      {optional.length > 0 ? (
        <SkillsRow label="бажані" items={optional} tone="optional" />
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
  items: string[];
  tone: "required" | "optional";
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {label}:
      </span>
      {items.map((s) => (
        <span
          key={s}
          className={cn(
            "border px-2 py-[2px] font-mono text-xs",
            tone === "required"
              ? "border-accent text-accent"
              : "border-border text-text-secondary",
          )}
        >
          #{s.toLowerCase()}
        </span>
      ))}
    </div>
  );
}

// ─── description ─────────────────────────────────────────────────────────

function DescriptionDetails({ text }: { text: string }) {
  return (
    <details className="group flex flex-col gap-2 border-l-2 border-border pl-3 hover:border-accent">
      <summary className="cursor-pointer list-none font-mono text-[11px] uppercase tracking-wider text-text-muted hover:text-accent">
        <span className="group-open:hidden">
          ▸ опис ({text.length} символів)
        </span>
        <span className="hidden group-open:inline">▾ опис</span>
      </summary>
      <p className="mt-1 max-h-[320px] overflow-auto whitespace-pre-wrap font-body text-sm leading-relaxed text-text-secondary">
        {text}
      </p>
    </details>
  );
}

// ─── sidebar (extraction status + actions) ───────────────────────────────

function Sidebar({
  record,
  ex,
}: {
  record: RecordListItem;
  ex: ExtractedVacancy | null;
}) {
  return (
    <div className="flex w-full flex-col gap-3 md:w-[240px] md:flex-shrink-0">
      <div
        className={cn(
          "flex flex-col gap-2 border bg-bg-elev p-4",
          ex ? "border-accent" : "border-border",
        )}
      >
        <span
          className={cn(
            "font-mono text-[11px] font-bold uppercase tracking-wider",
            ex ? "text-accent" : "text-text-muted",
          )}
        >
          &gt; екстракція
        </span>
        <span
          className={cn(
            "font-mono text-sm font-bold",
            ex ? "text-success" : "text-text-secondary",
          )}
        >
          {ex
            ? `✓ ${formatRelative(record.extractedAt)}`
            : "· очікує екстракції"}
        </span>
        {ex ? (
          <details className="group">
            <summary className="cursor-pointer list-none font-mono text-[11px] uppercase tracking-wider text-text-muted hover:text-accent">
              <span className="group-open:hidden">▸ сирий JSON</span>
              <span className="hidden group-open:inline">▾ сирий JSON</span>
            </summary>
            <pre className="mt-2 max-h-[260px] overflow-auto border border-border bg-bg p-2 font-mono text-[11px] leading-relaxed text-text-primary">
              {JSON.stringify(ex, null, 2)}
            </pre>
          </details>
        ) : null}
      </div>

      <Link
        href={`/dashboard/records/${record.id}`}
        className="flex items-center justify-center gap-2 border border-accent bg-bg px-4 py-[10px] font-body text-xs text-text-primary shadow-[4px_4px_0_0_#000] transition-[transform,box-shadow] hover:shadow-[2px_2px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px]"
      >
        <span className="text-accent">→</span> детально
      </Link>
      <Link
        href={`/dashboard/ingests/${record.rssIngestId}`}
        className="flex items-center justify-center gap-2 border border-border bg-bg px-4 py-[10px] font-body text-xs text-text-secondary shadow-[3px_3px_0_0_#000] transition-[transform,box-shadow] hover:shadow-[1px_1px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:text-text-primary"
      >
        <span className="text-text-muted">⌥</span> відкрити запуск
      </Link>
    </div>
  );
}

// ─── footer ──────────────────────────────────────────────────────────────

function Footer({ record }: { record: RecordListItem }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 font-mono text-[11px] uppercase tracking-wider">
      <span className="font-bold text-accent">&gt; ідентифікатори:</span>
      <span className="inline-flex items-center gap-2 text-text-muted">
        запис
        <CopyButton value={record.id} ariaLabel="скопіювати ідентифікатор запису" />
      </span>
      <Link
        href={`/dashboard/ingests/${record.rssIngestId}`}
        className="inline-flex items-center gap-1 text-text-secondary hover:text-accent"
      >
        <span className="text-accent">↗</span> запуск збору
      </Link>
      <span className="ml-auto text-text-muted">
        опубліковано · {formatDateTime(record.publishedAt)}
      </span>
    </div>
  );
}
