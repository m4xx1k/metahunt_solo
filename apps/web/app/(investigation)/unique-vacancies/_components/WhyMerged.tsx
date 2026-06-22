import type { DedupReason } from "@/lib/api/dedup";

// Per-member "why was this grouped" explanation. The data shape is
// `vacancies.dedup_reason`, shipped verbatim by the API. Kept deliberately
// plain — a similarity headline and which job fields agreed; the raw
// engineering signals (model, vector ids, Jaccard scores) stay out of the UI.
export function WhyMerged({ reason }: { reason: DedupReason }) {
  const simPct = (reason.similarity * 100).toFixed(0);
  return (
    <div className="flex flex-col gap-2 border-l-2 border-accent bg-bg/50 px-4 py-3">
      <div className="font-mono text-2xs text-text-muted">
        чому об&apos;єднано —{" "}
        <span className="font-bold text-text-primary">схожість опису {simPct}%</span>
      </div>
      <div className="flex flex-wrap gap-1.5 font-mono text-2xs">
        <MatchChip label="роль" state={reason.prefilterMatches.role} />
        <MatchChip label="рівень" state={reason.prefilterMatches.seniority} />
        <MatchChip label="формат" state={reason.prefilterMatches.workFormat} />
        <MatchChip label="компанія" state={reason.prefilterMatches.company} />
      </div>
    </div>
  );
}

function MatchChip({
  label,
  state,
}: {
  label: string;
  state: boolean | null;
}) {
  // true — both sides had the field and agreed; null — one side missing.
  // `false` never reaches here: a disagreeing field is filtered out by the
  // structural gates before a merge is considered.
  if (state === true) {
    return (
      <span className="inline-flex items-center bg-accent px-2 py-0.5 uppercase tracking-wider text-bg">
        {label}: ✓
      </span>
    );
  }
  return (
    <span className="inline-flex items-center border border-border bg-bg-card px-2 py-0.5 uppercase tracking-wider text-text-muted">
      {label}: ·
    </span>
  );
}
