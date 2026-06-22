import Link from "next/link";
import type { DedupMetrics } from "@/lib/api/dedup";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  metrics: DedupMetrics | null;
};

// Bucket boundaries match apps/etl/src/dedup/dedup.service.ts::getMetrics():
//   soft     0.85–0.92  (на ручний перегляд)
//   hard     0.92–0.95  (auto-merged, confirmed-tier)
//   veryHard >=0.95     (auto-merged, gold-tier)
const BUCKETS: Array<{
  key: "soft" | "hard" | "veryHard";
  label: string;
  note: string;
  tone: "warn" | "ok" | "gold";
}> = [
  { key: "soft", label: "0.85–0.92", note: "ручний перегляд", tone: "warn" },
  { key: "hard", label: "0.92–0.95", note: "автозлиття", tone: "ok" },
  { key: "veryHard", label: "≥ 0.95", note: "gold-tier", tone: "gold" },
];

export function DedupQualityWidget({ metrics }: Props) {
  if (!metrics) {
    return (
      <Panel title="Дедуплікація">
        <p className="font-mono text-sm text-text-muted">
          метрики недоступні
        </p>
      </Panel>
    );
  }

  const buckets = metrics.similarityBuckets;
  const max = Math.max(buckets.soft, buckets.hard, buckets.veryHard, 1);
  const crossPct = Math.round(metrics.crossSourceRatio * 100);

  return (
    <Panel
      title="Дедуплікація"
      subtitle="косинусна подібність дублікатів"
    >
      <ul className="flex flex-col gap-3">
        {BUCKETS.map((b) => {
          const count = buckets[b.key];
          const widthPct = max > 0 ? Math.max((count / max) * 100, 2) : 2;
          return (
            <li key={b.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between font-mono text-xs">
                <span className="text-text-secondary">{b.label}</span>
                <span className="font-bold text-text-primary">
                  {formatCount(count)}
                </span>
              </div>
              <div
                className="h-2 w-full border border-border bg-bg"
                aria-hidden="true"
              >
                <div
                  className={cn(
                    "h-full",
                    b.tone === "warn" && "bg-danger",
                    b.tone === "ok" && "bg-text-primary",
                    b.tone === "gold" && "bg-accent",
                  )}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="font-mono text-2xs text-text-muted">
                {b.note}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-col gap-1 border-t border-border pt-3 font-mono text-xs">
        <Row label="груп · усього" value={formatCount(metrics.totalGroups)} />
        <Row
          label="крос-джерельних"
          value={`${formatCount(metrics.crossSourceGroups)} · ${crossPct}%`}
        />
        <Row
          label="середній розмір"
          value={metrics.avgGroupSize.toFixed(2)}
        />
        <Link
          href="/unique-vacancies"
          className="mt-2 text-accent hover:underline"
        >
          → переглянути групи
        </Link>
      </div>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="uppercase tracking-wider text-text-muted">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-4 border border-border bg-bg-card p-5 shadow-brut-md">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-base font-bold text-text-primary">
          {title}
        </h3>
        {subtitle ? (
          <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
            {subtitle}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
