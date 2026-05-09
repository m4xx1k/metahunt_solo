import type { SkillBucket } from "@/lib/api/taxonomy";

const ORDER: SkillBucket["bucket"][] = [
  "100",
  "75-99",
  "50-74",
  "25-49",
  "1-24",
  "0",
];

const BUCKET_COLOR: Record<SkillBucket["bucket"], string> = {
  "100": "var(--color-success)",
  "75-99": "var(--color-accent)",
  "50-74": "var(--color-accent-secondary)",
  "25-49": "var(--color-text-muted)",
  "1-24": "var(--color-border-strong)",
  "0": "var(--color-danger)",
};

export function BucketHistogram({ buckets }: { buckets: SkillBucket[] }) {
  const byBucket = new Map(buckets.map((b) => [b.bucket, b]));
  const max = buckets.reduce((m, b) => Math.max(m, b.vacancies), 0);

  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
        verified-skill buckets · vacancies per %verified-skill share
      </span>
      <ul className="flex flex-col gap-1 border border-border bg-bg-card p-4">
        {ORDER.map((label) => {
          const b = byBucket.get(label);
          const count = b?.vacancies ?? 0;
          const widthPct = max > 0 ? (count / max) * 100 : 0;
          return (
            <li
              key={label}
              className="grid grid-cols-[80px_1fr_64px] items-center gap-3 font-mono text-xs"
            >
              <span className="text-text-muted">{label}%</span>
              <div className="h-3 w-full bg-bg-elev">
                <div
                  className="h-full"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: BUCKET_COLOR[label],
                  }}
                  title={`${label}% verified · ${count} vacancies`}
                />
              </div>
              <span className="text-right text-text-primary">{count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
