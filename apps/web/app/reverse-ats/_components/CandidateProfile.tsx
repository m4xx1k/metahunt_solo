import type { SkillRef } from "@/lib/api/ranking";

// What the engine understood about the candidate, surfaced so the user can
// sanity-check the extraction before trusting the ranking: role + seniority
// (for an uploaded CV), the skills that resolved onto the taxonomy (sorted by
// IDF weight — the rarest/strongest first), and anything that didn't map.
export function CandidateProfile({
  title,
  role,
  seniority,
  matched,
  unmatched,
  totalVacancies,
}: {
  title: string;
  role?: string | null;
  seniority?: string | null;
  matched: SkillRef[];
  unmatched: string[];
  totalVacancies: number;
}) {
  const skills = [...matched].sort((a, b) => b.weight - a.weight);
  const SHOWN = 40;
  const extra = skills.length - SHOWN;

  return (
    <div className="border border-border bg-bg-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-5 py-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          {title}
        </span>
        {role ? (
          <span className="font-mono text-sm font-bold text-text-primary">{role}</span>
        ) : null}
        {seniority ? (
          <span className="font-mono text-xs text-accent">{seniority.toLowerCase()}</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 px-5 py-4">
        <p className="font-mono text-xs text-text-secondary">
          <span className="text-success">{matched.length}</span> навичок розпізнано
          {unmatched.length > 0 ? (
            <>
              {" · "}
              <span className="text-text-muted">{unmatched.length} не знайдено</span>
            </>
          ) : null}
          {" · "}
          <span className="text-accent">{totalVacancies}</span> вакансій з перетином
        </p>

        {skills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {skills.slice(0, SHOWN).map((s) => (
              <span
                key={s.id}
                className="border border-border px-1.5 py-[1px] font-mono text-[11px] text-text-secondary"
              >
                {s.name.toLowerCase()}
              </span>
            ))}
            {extra > 0 ? (
              <span className="px-1 font-mono text-[11px] text-text-muted">+{extra}</span>
            ) : null}
          </div>
        ) : null}

        {unmatched.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              не в таксономії
            </span>
            {unmatched.slice(0, 12).map((s) => (
              <span
                key={s}
                className="border border-dashed border-border px-1.5 py-[1px] font-mono text-[11px] text-text-muted"
              >
                {s.toLowerCase()}
              </span>
            ))}
            {unmatched.length > 12 ? (
              <span className="font-mono text-[11px] text-text-muted">
                +{unmatched.length - 12}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
