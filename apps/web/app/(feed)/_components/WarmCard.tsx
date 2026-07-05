"use client";

import { cn } from "@/lib/utils";
import { VacancyCard } from "@/entities/vacancy/VacancyCard";
import type { FitTier, RankedVacancy } from "@/lib/api/ranking";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

// Hints frame the tier as weighted fit (importance-adjusted), NOT a raw count —
// the pip strip already shows the literal "N of M required" via its aria-label.
const TIER: Record<FitTier, { fill: string; text: string; label: string; hint: string }> = {
  STRONG: {
    fill: "border-success bg-success",
    text: "text-success",
    label: "strong",
    hint: "Strong fit — you have the most important skills this role requires.",
  },
  GOOD: {
    fill: "border-accent bg-accent",
    text: "text-accent",
    label: "good",
    hint: "Good fit — you have many of the key required skills.",
  },
  STRETCH: {
    fill: "border-text-muted bg-text-muted",
    text: "text-text-muted",
    label: "stretch",
    hint: "A stretch — you're missing several of the more important required skills.",
  },
};

// Pips show required-skill coverage; skip a separate diff block since the
// card's own chips already carry have/lack colors via `match`.
export function WarmCard({
  item,
  candidateSkillIds,
}: {
  item: RankedVacancy;
  candidateSkillIds: readonly string[];
}) {
  const t = TIER[item.fit.tier];
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-4 border border-b-0 border-border bg-bg-card px-5 py-2.5 font-mono text-xs">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              aria-label={`${t.label} fit — ${item.fit.matchedRequired} of ${item.fit.requiredTotal} required skills covered`}
              className="inline-flex cursor-help flex-col gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="flex gap-1" aria-hidden>
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
                aria-hidden
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
              <span
                tabIndex={0}
                className="cursor-help border border-text-muted px-2 py-[2px] uppercase tracking-wider text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
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
