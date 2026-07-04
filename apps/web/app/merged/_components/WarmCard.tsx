"use client";

import { VacancyCard } from "@/entities/vacancy/VacancyCard";
import type { FitTier, RankedVacancy } from "@/lib/api/ranking";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

const TIER: Record<FitTier, { cls: string; label: string; hint: string }> = {
  STRONG: {
    cls: "border-success bg-success text-bg",
    label: "strong fit",
    hint: "ти покриваєш майже всі обовʼязкові скіли цієї вакансії",
  },
  GOOD: {
    cls: "border-accent text-accent",
    label: "good fit",
    hint: "ти покриваєш більшість обовʼязкових скілів",
  },
  STRETCH: {
    cls: "border-text-muted text-text-muted",
    label: "stretch",
    hint: "збігів мало — вакансія на виріст",
  },
};

// One ranked vacancy: a compact fit strip (tier · coverage · relevance, each
// tooltipped) merged into the top border of the exact feed card. The card's own
// skill chips carry the green/red have-lacks borders via its `match` prop, so
// no separate diff block is needed. `candidateSkillIds` is the CV's resolved
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
      <div className="flex flex-wrap items-center gap-3 border border-b-0 border-border bg-bg-card px-5 py-2.5 font-mono text-xs">
        <span className="text-text-muted">#{rank}</span>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`cursor-help border px-2 py-[2px] font-bold uppercase tracking-wider ${t.cls}`}>
              {t.label}
            </span>
          </TooltipTrigger>
          <TooltipContent>{t.hint}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-text-secondary">
              стек{" "}
              <span className="text-text-primary">
                {item.fit.matchedRequired}/{item.fit.requiredTotal}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            скільки обовʼязкових скілів вакансії ти вже маєш
          </TooltipContent>
        </Tooltip>

        {!item.onStack ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help border border-text-muted px-2 py-[2px] uppercase tracking-wider text-text-muted">
                інший стек
              </span>
            </TooltipTrigger>
            <TooltipContent>
              вакансія для іншого стеку, ніж твій основний — тому нижче за вакансії
              твого стеку (за окремими скілами все одно може підходити).
            </TooltipContent>
          </Tooltip>
        ) : null}

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="ml-auto cursor-help text-accent">
              relevance <span className="font-bold">{item.relevance.toFixed(1)}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            загальна оцінка збігу твоїх скілів із цією вакансією
          </TooltipContent>
        </Tooltip>
      </div>

      <VacancyCard vacancy={item.vacancy} match={{ haveSkillIds: candidateSkillIds }} />
    </div>
  );
}
