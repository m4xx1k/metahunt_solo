"use client";

import Link from "next/link";

import { VacancyCard } from "@/entities/vacancy/VacancyCard";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import type { VacancyDto } from "@/lib/api/vacancies";

import { DiffCounts } from "./DiffCounts";
import { FitBadge } from "./FitBadge";
import { countSkillDiff } from "./skill-diff";

// Cold card: the same Fit slot the warm card has. `vacancy.match` is real now
// (MET-144 — the unified feed scores the cheap path too), so three states:
//   - no CV/sample selected at all → locked, asks for one (unchanged);
//   - one selected and this Position scored → the real badge + diff counts,
//     at parity with LabWarmCard (counts come from the page's `viewerSkills`);
//   - one selected but nothing scored (no tagged skills) → no slot at all,
//     same as a warm card would show nothing to claim.
export function LabColdCard({
  vacancy,
  hasViewer,
  viewerSkillIds = [],
}: {
  vacancy: VacancyDto;
  /** A CV or sample is selected — even if this particular card scored null. */
  hasViewer: boolean;
  /** The scored viewer's resolved skill ids (`FeedResponse.viewerSkills`),
   *  for the ✅/❌/➕ counts. Empty when there is no viewer. */
  viewerSkillIds?: readonly string[];
}) {
  const analytics = useAnalytics();
  const diff = vacancy.match ? countSkillDiff(vacancy.skills, viewerSkillIds) : null;

  return (
    <div className="flex flex-col">
      {!hasViewer ? (
        <div className="flex flex-wrap items-center gap-3 border border-b-0 border-border bg-bg-card px-5 py-2.5 font-mono text-xs">
          <span
            aria-hidden
            className="inline-flex items-baseline gap-1.5 border border-dashed border-border-strong px-2 py-[2px] text-text-muted"
          >
            <span className="text-sm font-bold leading-none">— %</span>
            <span className="text-2xs font-bold uppercase tracking-wider">fit · locked</span>
          </span>
          <Link
            href="/match"
            onClick={() => analytics.feedScoreLocked(vacancy.id)}
            className="uppercase tracking-wider text-accent underline underline-offset-2 hover:text-text-primary"
          >
            add your CV to see the fit
          </Link>
        </div>
      ) : vacancy.match ? (
        <div className="flex flex-wrap items-center gap-3 border border-b-0 border-border bg-bg-card px-5 py-2.5 font-mono text-xs">
          <FitBadge
            tier={vacancy.match.tier}
            percent={vacancy.match.percent}
            tooltip={<span className="font-bold">Fit {vacancy.match.percent}%</span>}
          />
          {diff ? <DiffCounts have={diff.have} missing={diff.missing} bonus={diff.bonus} /> : null}
          {!vacancy.match.onStack ? (
            <span className="border border-text-muted px-2 py-[2px] uppercase tracking-wider text-text-muted">
              off-stack
            </span>
          ) : null}
        </div>
      ) : null}

      <VacancyCard
        vacancy={vacancy}
        match={vacancy.match ? { haveSkillIds: viewerSkillIds } : undefined}
      />
    </div>
  );
}
