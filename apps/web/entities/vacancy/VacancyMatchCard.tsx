"use client";

import Link from "next/link";

import { FitBadge } from "@/entities/vacancy/FitBadge";
import { skillDiff } from "@/entities/vacancy/skill-diff";
import { VacancyCard } from "@/entities/vacancy/VacancyCard";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import type { NodeRef, VacancyDto } from "@/lib/api/vacancies";

import { DiffCounts } from "./DiffCounts";

// The one feed card, both routes (MET-144 step 7b: no more cold/warm fork).
// A Fit badge + diff counts when this vacancy scored, computed client-side
// from `viewerSkills` (off the /feed response) via skillDiff. Three states:
//   - no viewer at all → locked, asks for a CV;
//   - a viewer and this vacancy scored → the badge + diff counts;
//   - a viewer but nothing scored (no tagged skills) → no slot at all.
export function VacancyMatchCard({
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
