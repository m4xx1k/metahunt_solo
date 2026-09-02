"use client";

import { cn } from "@/lib/utils";
import { VacancyCard } from "@/entities/vacancy/VacancyCard";
import type { RankedVacancy, ScoreSignal } from "@/lib/api/ranking";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

import { FitBadge } from "./FitBadge";

const SIGNAL_LABEL: Record<ScoreSignal["kind"], string> = {
  "skill-overlap": "skill overlap",
};

// Warm card for the lab feed: the Fit % leads, then the three diff counts that
// explain it (have / missing / bonus, straight off SkillDiff). Off-stack is a
// plain marker here — it no longer moves the card's position, so it must not
// look like a penalty.
export function LabWarmCard({
  item,
  candidateSkillIds,
}: {
  item: RankedVacancy;
  candidateSkillIds: readonly string[];
}) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 border border-b-0 border-border bg-bg-card px-5 py-2.5 font-mono text-xs">
        <FitBadge
          tier={item.fit.tier}
          percent={item.fit.percent}
          detail={`${item.fit.matchedRequired} of ${item.fit.requiredTotal} required skills covered`}
          tooltip={
            <span className="flex flex-col gap-1">
              <span className="font-bold">Fit {item.fit.percent}%</span>
              {item.breakdown.signals.map((signal) => (
                <span key={signal.kind}>
                  {SIGNAL_LABEL[signal.kind]} {Math.round(signal.raw * 100)}% × weight{" "}
                  {signal.weight}
                </span>
              ))}
              <span className="text-text-muted">
                {item.fit.matchedRequired} of {item.fit.requiredTotal} required skills, weighted by
                how rare each one is.
              </span>
            </span>
          }
        />

        <span className="flex flex-wrap items-center gap-2">
          <DiffCount
            tone="have"
            count={item.diff.have.length}
            hint="Skills this job wants and you have."
          />
          <DiffCount
            tone="missing"
            count={item.diff.missing.length}
            hint="Required skills you don't list."
          />
          <DiffCount
            tone="bonus"
            count={item.diff.bonus.length}
            hint="Your skills this job doesn't ask for."
          />
        </span>

        {!item.onStack ? (
          <span className="border border-text-muted px-2 py-[2px] uppercase tracking-wider text-text-muted">
            off-stack
          </span>
        ) : null}
      </div>

      <VacancyCard vacancy={item.vacancy} match={{ haveSkillIds: candidateSkillIds }} />
    </div>
  );
}

const TONE = {
  have: { className: "border-success text-success", glyph: "✓" },
  missing: { className: "border-danger text-danger", glyph: "✗" },
  bonus: { className: "border-border text-text-muted", glyph: "+" },
} as const;

function DiffCount({
  tone,
  count,
  hint,
}: {
  tone: keyof typeof TONE;
  count: number;
  hint: string;
}) {
  const t = TONE[tone];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`${count} ${tone}`}
          className={cn(
            "inline-flex cursor-help items-center gap-1 border px-1.5 py-[1px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            t.className,
          )}
        >
          <span aria-hidden>{t.glyph}</span>
          {count}
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
