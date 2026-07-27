import Link from "next/link";

import type { AtsBoardCompany, AtsBoardVacancy } from "@/lib/api/ats";
import { Badge, Tag } from "@/ui";

function formatLocations(locations: unknown): string {
  if (!Array.isArray(locations)) return "";
  const names = locations
    .map((l) => (typeof l === "string" ? l : ((l as { city?: string })?.city ?? "")))
    .filter(Boolean);
  return names.slice(0, 3).join(" · ");
}

function formatSalary(v: AtsBoardVacancy): string | null {
  if (v.salaryMin == null && v.salaryMax == null) return null;
  const amount =
    v.salaryMin != null && v.salaryMax != null
      ? `${v.salaryMin.toLocaleString("uk-UA")}–${v.salaryMax.toLocaleString("uk-UA")}`
      : (v.salaryMin ?? v.salaryMax)!.toLocaleString("uk-UA");
  return `${amount} ${v.currency ?? ""}`.trim();
}

function VacancyRow({ vacancy }: { vacancy: AtsBoardVacancy }) {
  const salary = formatSalary(vacancy);
  const where = formatLocations(vacancy.locations);

  return (
    <li className="border-t border-border">
      <Link
        href={`/vacancy/${vacancy.id}`}
        className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-surface md:flex-row md:items-center md:justify-between md:gap-4"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-fg">{vacancy.title}</span>
          {vacancy.seniority ? (
            <span className="shrink-0 text-[11px] text-fg-muted">{vacancy.seniority}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-3 text-[11px] text-fg-muted">
          {where ? <span className="truncate">{where}</span> : null}
          {vacancy.workFormat === "REMOTE" ? <span>remote</span> : null}
          {salary ? (
            // The distinction the whole ATS source exists for: a number the
            // employer published, versus one we read out of the description.
            <span className={vacancy.salarySource === "ATS_STRUCTURED" ? "text-fg" : ""}>
              {salary}
              {vacancy.salarySource === "ATS_STRUCTURED" ? " ✓" : ""}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

export function CompanyBoard({ company }: { company: AtsBoardCompany }) {
  const hidden = Number(company.total) - company.vacancies.length;

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-bg">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2">
          {company.slug ? (
            <Link href={`/company/${company.slug}`} className="text-sm font-medium hover:underline">
              {company.name}
            </Link>
          ) : (
            <span className="text-sm font-medium">{company.name}</span>
          )}
          <Badge>{company.atsType}</Badge>
        </span>
        <span className="flex items-center gap-3 text-[11px] text-fg-muted">
          <span>{company.total} вакансій</span>
          {company.uaCount > 0 ? <span>{company.uaCount} в Україні</span> : null}
          {company.statedSalaryCount > 0 ? (
            <span className="text-fg">{company.statedSalaryCount} із зп ✓</span>
          ) : null}
        </span>
      </header>

      <ul>
        {company.vacancies.map((vacancy) => (
          <VacancyRow key={vacancy.id} vacancy={vacancy} />
        ))}
      </ul>

      {hidden > 0 && company.slug ? (
        <footer className="border-t border-border px-4 py-2">
          <Link
            href={`/company/${company.slug}`}
            className="text-[11px] text-fg-muted hover:underline"
          >
            ще {hidden} →
          </Link>
        </footer>
      ) : null}
    </article>
  );
}

export function BoardsEmpty() {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
      <Tag>&gt; порожньо</Tag>
      <p className="mt-3 text-sm text-fg-muted">Жодного ATS-борда ще не завантажено.</p>
    </div>
  );
}
