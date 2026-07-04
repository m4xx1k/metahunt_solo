"use client";

import { cn } from "@/lib/utils";
import { VacancyCard } from "@/entities/vacancy/VacancyCard";
import type { FitTier, RankedVacancy } from "@/lib/api/ranking";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

const TIER: Record<FitTier, { fill: string; text: string; label: string; hint: string }> = {
  STRONG: {
    fill: "border-success bg-success",
    text: "text-success",
    label: "strong",
    hint: "You cover almost all of this job's required skills",
  },
  GOOD: {
    fill: "border-accent bg-accent",
    text: "text-accent",
    label: "good",
    hint: "You cover most of the required skills",
  },
  STRETCH: {
    fill: "border-text-muted bg-text-muted",
    text: "text-text-muted",
    label: "stretch",
    hint: "Few matches — a stretch role",
  },
};

// One ranked vacancy: a compact fit strip merged into the top border of the
// exact feed card. Fit + required coverage are one widget — a pip per required
// skill (filled = covered), tier-coloured, with the tier word below. The card's
// own skill chips carry the green/red have-lacks borders via its `match` prop,
// so no separate diff block is needed. `candidateSkillIds` is the CV's resolved
// skill set (shared across the list).
export function WarmCard({
  item,
  rank,
  candidateSkillIds,
}: {
  item: RankedVacancy;
  rank: number;
  candidateSkillIds: readonly string[];
}) {
  const t = TIER[item.fit.tier];
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-4 border border-b-0 border-border bg-bg-card px-5 py-2.5 font-mono text-xs">
        {/* <span className="text-text-muted">#{rank}</span> */}

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-help flex-col gap-1">
              <span
                className="flex gap-1"
                aria-label={`${item.fit.matchedRequired} of ${item.fit.requiredTotal} required skills`}
              >
                {Array.from({ length: item.fit.requiredTotal }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-2.5 w-2.5 border",
                      i < item.fit.matchedRequired ? t.fill : "border-border-strong",
                    )}
                  />
                ))}
              </span>
              <span
                className={cn(
                  "text-2xs font-bold uppercase leading-none tracking-wider",
                  t.text,
                )}
              >
                {t.label}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t.hint}</TooltipContent>
        </Tooltip>

        {!item.onStack ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help border border-text-muted px-2 py-[2px] uppercase tracking-wider text-text-muted">
                off-stack
              </span>
            </TooltipTrigger>
            <TooltipContent>
              This job targets a different stack than your main one, so it ranks
              below jobs in your stack (individual skills may still fit).
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <VacancyCard vacancy={item.vacancy} match={{ haveSkillIds: candidateSkillIds }} />
    </div>
  );
}
