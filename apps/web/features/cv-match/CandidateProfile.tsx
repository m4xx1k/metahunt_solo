import type { SkillRef } from "@/lib/api/ranking";

// What the engine understood about the candidate, shown as a right-rail panel so
// the user can sanity-check the extraction before trusting the ranking: role +
// seniority (uploaded CV), the skills that resolved onto the taxonomy (sorted by
// IDF weight — rarest/strongest first), and anything that didn't map.
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
  // Popular skills first: a lower IDF weight means a higher df — more vacancies
  // want it. weight 0 = the skill is on no vacancy (df=0), so it's not popular,
  // just unknown → push it to the end rather than the front.
  const skills = [...matched].sort(
    (a, b) => (a.weight || Infinity) - (b.weight || Infinity),
  );
  const SHOWN = 24;
  const extra = skills.length - SHOWN;

  return (
    <div className="border border-border bg-bg-card">
      <div className="h-1 bg-accent" />
      <div className="flex flex-col gap-4 px-5 py-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            {title}
          </p>
          {role ? (
            <p className="mt-1.5 font-mono text-lg font-bold leading-tight text-text-primary">
              {role}
            </p>
          ) : null}
          {seniority ? (
            <span className="mt-2 inline-block border border-border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-text-secondary">
              {seniority.toLowerCase()}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-px border border-border bg-border">
          <Stat value={matched.length} label="skills" tone="text-success" />
          <Stat value={totalVacancies} label="jobs" tone="text-accent" />
        </div>
        {unmatched.length > 0 ? (
          <p className="-mt-2 font-mono text-[10px] text-text-muted">
            {unmatched.length} unrecognized
          </p>
        ) : null}

        {skills.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              skills
            </p>
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
                <span className="px-1 font-mono text-[11px] text-text-muted">
                  +{extra}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {unmatched.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              not in taxonomy
            </p>
            <div className="flex flex-wrap gap-1.5">
              {unmatched.slice(0, 10).map((s) => (
                <span
                  key={s}
                  className="border border-dashed border-border px-1.5 py-[1px] font-mono text-[11px] text-text-muted"
                >
                  {s.toLowerCase()}
                </span>
              ))}
              {unmatched.length > 10 ? (
                <span className="px-1 font-mono text-[11px] text-text-muted">
                  +{unmatched.length - 10}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-bg-card px-3 py-3">
      <span className={`font-mono text-2xl font-bold leading-none ${tone}`}>
        {value}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
    </div>
  );
}
