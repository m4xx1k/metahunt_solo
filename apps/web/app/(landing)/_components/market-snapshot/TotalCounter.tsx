import type { AggregateSourceCount } from "@/lib/api/aggregates";

type Props = {
  total: number;
  lastSyncAt: string | null;
  sources: AggregateSourceCount[];
};

function relativeMinutes(iso: string | null): string {
  if (!iso) return "не оновлено";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.round(diffMs / 60000));
  if (min < 1) return "оновлено щойно";
  if (min < 60) return `оновлено ${min} хв тому`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `оновлено ${hr} год тому`;
  const d = Math.round(hr / 24);
  return `оновлено ${d} дн тому`;
}

const FORMATTER = new Intl.NumberFormat("uk-UA");

export function TotalCounter({ total, lastSyncAt, sources }: Props) {
  const sourceLabel = sources.map((s) => s.displayName).join(" + ") || "—";
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface px-8 py-6 md:items-end md:text-right">
      <span className="font-display text-6xl font-bold leading-none text-text-primary md:text-7xl">
        {FORMATTER.format(total)}
      </span>
      <span className="font-body text-sm text-text-secondary">
        вакансій зараз на ринку UA
      </span>
      <span className="flex items-center gap-2 font-mono text-xs text-text-muted">
        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
        {relativeMinutes(lastSyncAt)} · {sourceLabel}
      </span>
    </div>
  );
}
