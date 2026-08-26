import Link from "next/link";

import { SeniorityBadge } from "@/entities/vacancy/SeniorityBadge";
import { SkillChip } from "@/entities/skill/SkillChip";
import type { VacancyDto } from "@/lib/api/vacancies";
import { formatSalary } from "@/lib/extracted-vacancy";
import { formatRelative } from "@/lib/format";
import { vacancyPath } from "@/lib/seo/vacancy-url";

const SKILLS_SHOWN = 3;

/**
 * Sized for the 336px rail. The similar list already holds full VacancyDtos, so
 * salary, seniority and skills cost nothing extra — the old markup rendered a
 * bare role name and threw the rest away.
 */
export function SimilarVacancyCard({ vacancy }: { vacancy: VacancyDto }) {
  const salary = formatSalary({
    min: vacancy.salary.min,
    max: vacancy.salary.max,
    currency: vacancy.salary.currency,
  });
  const skills = vacancy.skills.required.slice(0, SKILLS_SHOWN);
  const overflow = vacancy.skills.required.length - skills.length;

  return (
    <Link
      href={vacancyPath({ id: vacancy.id, roleName: vacancy.role?.name, title: vacancy.title })}
      className="flex flex-col gap-2 border border-border bg-bg-card p-4 transition-colors hover:border-accent"
    >
      <div className="flex flex-wrap items-center gap-2">
        {vacancy.seniority ? <SeniorityBadge seniority={vacancy.seniority} outline /> : null}
        <span className="font-mono text-sm leading-snug text-text-primary">
          {vacancy.role?.name ?? vacancy.title}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-xs text-text-secondary">
          {vacancy.company?.name ?? vacancy.source.displayName.trim()}
        </span>
        {salary ? <span className="font-mono text-xs font-bold text-success">{salary}</span> : null}
      </div>

      {skills.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {skills.map((s) => (
            <SkillChip key={s.id} name={s.name} tone="required" size="xs" />
          ))}
          {overflow > 0 ? (
            <span className="font-mono text-2xs text-text-muted">+{overflow}</span>
          ) : null}
        </div>
      ) : null}

      <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
        {formatRelative(vacancy.publishedAt)}
      </span>
    </Link>
  );
}
