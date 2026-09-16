"use client";

import { FitBadge } from "@/entities/vacancy/FitBadge";
import { skillDiff } from "@/entities/vacancy/skill-diff";
import { VacancyCard } from "@/entities/vacancy/VacancyCard";
import type { NodeRef, VacancyDto } from "@/lib/api/vacancies";

import { DiffCounts } from "./DiffCounts";

// The one feed card, both routes (MET-144 step 7b: no more cold/warm fork).
// A Fit badge + diff counts when this vacancy scored, computed client-side
// from `viewerSkills` (off the /feed response) via skillDiff. Without a scored
// viewer the card simply carries no fit slot — the CV ask lives in one place
// on the page, not on every card.
export function VacancyMatchCard({
  vacancy,
  viewerSkills = [],
}: {
  vacancy: VacancyDto;
  /** The scored viewer's resolved skills (`FeedResponse.viewerSkills`), for
   *  the ✅/❌/➕ counts. Empty when there is no viewer. */
  viewerSkills?: readonly NodeRef[];
}) {
  const diff = vacancy.match ? skillDiff(vacancy.skills, viewerSkills) : null;
  const viewerSkillIds = viewerSkills.map((s) => s.id);
  const requiredTotal = vacancy.skills.required.length;
  const fitDetail =
    diff && requiredTotal > 0
      ? `${requiredTotal - diff.missing.length} of ${requiredTotal} required skills`
      : undefined;

  return (
    <div className="flex flex-col">
      {vacancy.match ? (
        <div className="flex flex-wrap items-center gap-3 border border-b-0 border-border bg-bg-card px-5 py-2.5 font-mono text-xs">
          <FitBadge tier={vacancy.match.tier} percent={vacancy.match.percent} detail={fitDetail} />
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
