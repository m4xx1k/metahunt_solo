import Link from "next/link";
import type { VacancyDto } from "@/lib/api/vacancies";

type Props = { vacancy: VacancyDto };

const SENIORITY_LABEL: Record<NonNullable<VacancyDto["seniority"]>, string> = {
  INTERN: "Intern",
  JUNIOR: "Junior",
  MIDDLE: "Middle",
  SENIOR: "Senior",
  LEAD: "Lead",
  PRINCIPAL: "Principal",
  C_LEVEL: "C-Level",
};
const FORMAT_LABEL: Record<NonNullable<VacancyDto["workFormat"]>, string> = {
  REMOTE: "Remote",
  OFFICE: "Office",
  HYBRID: "Hybrid",
};
const EMPLOYMENT_LABEL: Record<
  NonNullable<VacancyDto["employmentType"]>,
  string
> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  FREELANCE: "Freelance",
  INTERNSHIP: "Internship",
};
const ENGLISH_LABEL: Record<NonNullable<VacancyDto["englishLevel"]>, string> = {
  BEGINNER: "English Beginner",
  INTERMEDIATE: "English Intermediate",
  UPPER_INTERMEDIATE: "English Upper-Int",
  ADVANCED: "English Advanced",
  NATIVE: "English Native",
};

const SKILLS_SHOWN = 5;
const NF = new Intl.NumberFormat("en-US");

function formatSalary(s: VacancyDto["salary"]): string | null {
  const cur = s.currency ?? "";
  if (s.min != null && s.max != null) {
    return `${NF.format(s.min)} – ${NF.format(s.max)} ${cur}`.trim();
  }
  if (s.min != null) return `від ${NF.format(s.min)} ${cur}`.trim();
  if (s.max != null) return `до ${NF.format(s.max)} ${cur}`.trim();
  return null;
}

export function PublicVacancyCard({ vacancy: v }: Props) {
  const subtitleParts = [
    v.company?.name ?? null,
    v.locations[0] ?? null,
    v.workFormat ? FORMAT_LABEL[v.workFormat] : null,
  ].filter((p): p is string => Boolean(p));

  const tags = [
    v.seniority ? SENIORITY_LABEL[v.seniority] : null,
    v.employmentType ? EMPLOYMENT_LABEL[v.employmentType] : null,
    v.englishLevel ? ENGLISH_LABEL[v.englishLevel] : null,
  ].filter((t): t is string => Boolean(t));

  const skillNames = [
    ...v.skills.required.map((s) => s.name),
    ...v.skills.optional.map((s) => s.name),
  ];
  const visibleSkills = skillNames.slice(0, SKILLS_SHOWN);
  const moreSkillCount = Math.max(0, skillNames.length - SKILLS_SHOWN);
  const salary = formatSalary(v.salary);

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-text-muted">
      <header className="flex items-start justify-between gap-4">
        <h3 className="font-display text-xl font-semibold leading-snug text-text-primary">
          {v.title}
        </h3>
        <span className="shrink-0 rounded-full border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
          {v.source.code}
        </span>
      </header>

      {subtitleParts.length > 0 && (
        <p className="font-body text-sm text-text-secondary">
          {subtitleParts.join(" · ")}
        </p>
      )}

      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <li
              key={t}
              className="rounded-full bg-bg px-2.5 py-1 font-mono text-[11px] text-text-secondary"
            >
              {t}
            </li>
          ))}
        </ul>
      )}

      {visibleSkills.length > 0 && (
        <p className="font-body text-sm text-text-secondary">
          {visibleSkills.join(" · ")}
          {moreSkillCount > 0 && (
            <span className="text-text-muted"> · +{moreSkillCount} more</span>
          )}
        </p>
      )}

      <p
        className={
          salary
            ? "font-mono text-sm text-text-primary"
            : "font-mono text-sm text-text-muted"
        }
      >
        {salary ?? "ЗП не вказано"}
      </p>

      <footer className="flex flex-wrap items-center justify-end gap-4 pt-2">
        {v.link && (
          <a
            href={v.link}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-sm text-accent hover:underline"
          >
            подати заявку ↗
          </a>
        )}
        <Link
          href={`/records/${v.rssRecordId}`}
          className="font-mono text-sm text-text-secondary hover:underline"
        >
          запис у нас →
        </Link>
      </footer>
    </article>
  );
}
