import { dedupRuleLabel, isRuleReason, type UniqueVacancyMember } from "@/lib/api/dedup";

// Per-member "why was this grouped": the rule that linked it plus the three
// signals the rule looked at, as stored in `vacancies.dedup_reason`.
export function WhyMerged({ reason }: { reason: NonNullable<UniqueVacancyMember["dedupReason"]> }) {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <div className="flex flex-col gap-1 border-l-2 border-accent bg-bg/50 px-4 py-3 font-mono text-2xs text-text-muted">
      <div>
        why merged — <span className="font-bold text-text-primary">{dedupRuleLabel(reason)}</span>
      </div>
      {isRuleReason(reason) ? (
        <div>
          title {pct(reason.titleSim)} · text {pct(reason.containment)} · cosine{" "}
          {reason.cosine === null ? "—" : reason.cosine.toFixed(2)}
        </div>
      ) : null}
    </div>
  );
}
