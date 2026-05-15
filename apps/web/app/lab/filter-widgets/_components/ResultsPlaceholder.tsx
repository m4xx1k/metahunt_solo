// Stand-in for the future vacancy list. The lab is filter-only — the
// real results panel lands once we port this onto app/(landing).

export function ResultsPlaceholder() {
  return (
    <div className="flex min-h-[420px] items-center justify-center border border-dashed border-border bg-bg-card/30 p-12">
      <p className="font-mono text-xs uppercase tracking-wider text-text-muted">
        {"// vacancies will appear here"}
      </p>
    </div>
  );
}
