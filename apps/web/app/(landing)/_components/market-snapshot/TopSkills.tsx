import type { AggregateSkillCount } from "@/lib/api/aggregates";

type Props = {
  skills: AggregateSkillCount[];
  totalVacancies: number;
};

const DISPLAY_COUNT = 8;

export function TopSkills({ skills, totalVacancies }: Props) {
  const top = skills.slice(0, DISPLAY_COUNT);
  const max = top[0]?.count ?? 0;

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        top skills
      </span>
      {top.length === 0 ? (
        <span className="font-mono text-xs text-text-muted">no skills yet</span>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {top.map((skill) => {
            const widthPct = max > 0 ? (skill.count / max) * 100 : 0;
            const sharePct =
              totalVacancies > 0
                ? Math.round((skill.count / totalVacancies) * 100)
                : 0;
            return (
              <li
                key={skill.id}
                className="grid grid-cols-[1fr_auto] items-center gap-3"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-body text-sm text-text-primary">
                    {skill.name}
                  </span>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/50">
                    <div
                      className="h-full origin-left rounded-full bg-accent"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
                <span className="font-mono text-xs tabular-nums text-text-muted">
                  {sharePct}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
