"use client";

import Link from "next/link";

import { FitBadge } from "@/entities/vacancy/FitBadge";
import { skillDiff } from "@/entities/vacancy/skill-diff";
import { VacancyCard } from "@/entities/vacancy/VacancyCard";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import type { NodeRef, VacancyDto } from "@/lib/api/vacancies";

import { DiffCounts } from "./DiffCounts";

// The lab feed's one card (MET-144 step 7: the lab's warm branch — and
// LabWarmCard — retired, since it had no reachable UI entry point; every
// card runs through the unified `vacancy.match` now). Three states:
//   - no sample selected at all → locked, asks for one;
//   - one selected and this Position scored → the real badge + diff counts
//     (`viewerSkills` off the page response, via skillDiff);
//   - one selected but nothing scored (no tagged skills) → no slot at all.
export function LabColdCard({
  vacancy,
  hasViewer,
  viewerSkills = [],
}: {
  vacancy: VacancyDto;
  /** A sample is selected — even if this particular card scored null. */
  hasViewer: boolean;
  /** The scored viewer's resolved skills (`FeedResponse.viewerSkills`), for
   *  the ✅/❌/➕ counts. Empty when there is no viewer. */
  viewerSkills?: readonly NodeRef[];
}) {
  const analytics = useAnalytics();
  const diff = vacancy.match ? skillDiff(vacancy.skills, viewerSkills) : null;
  const viewerSkillIds = viewerSkills.map((s) => s.id);

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
          {diff ? (
            <DiffCounts
              have={diff.have.length}
              missing={diff.missing.length}
              bonus={diff.bonus.length}
            />
          ) : null}
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
