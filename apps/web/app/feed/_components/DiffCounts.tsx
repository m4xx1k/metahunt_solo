"use client";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

// The have / missing / bonus trio that explains a Fit %. Shared by both lab
// cards: the warm card feeds it `RankedVacancy.diff` lengths, the cold card
// feeds it `countSkillDiff(...)` — same three numbers, same look, so flipping
// a sample from the warm lens to the unified cold path keeps the diff.
export function DiffCounts({
  have,
  missing,
  bonus,
}: {
  have: number;
  missing: number;
  bonus: number;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <DiffCount tone="have" count={have} hint="Skills this job wants and you have." />
      <DiffCount tone="missing" count={missing} hint="Required skills you don't list." />
      <DiffCount tone="bonus" count={bonus} hint="Your skills this job doesn't ask for." />
    </span>
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
