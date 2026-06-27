import { VacancyCard } from "@/entities/vacancy/VacancyCard";
import { SkillChip, type SkillTone } from "@/entities/skill/SkillChip";
import type { FitTier, RankedVacancy, SkillRef } from "@/lib/api/ranking";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

const TIER: Record<FitTier, { cls: string; label: string }> = {
  STRONG: { cls: "border-success bg-success text-bg", label: "strong fit" },
  GOOD: { cls: "border-accent text-accent", label: "good fit" },
  STRETCH: { cls: "border-text-muted text-text-muted", label: "stretch" },
};

// One ranked vacancy: a match overlay (fit tier · relevance · ✅/❌/➕ diff)
// stacked on top of the exact feed card, so the row reads like the feed plus
// a personalized verdict. The strips use border-b-0 to merge into the card's
// own top border into one continuous box.
export function MatchCard({ item, rank }: { item: RankedVacancy; rank: number }) {
  const t = TIER[item.fit.tier];
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 border border-b-0 border-border bg-bg-card px-6 py-3 font-mono text-xs">
        <span className="text-text-muted">#{rank}</span>
        <span className={`border px-2 py-[2px] font-bold uppercase tracking-wider ${t.cls}`}>
          {t.label}
        </span>
        {!item.onStack ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help border border-text-muted px-2 py-[2px] uppercase tracking-wider text-text-muted">
                інший стек
              </span>
            </TooltipTrigger>
            <TooltipContent>
              вакансія для іншого стеку, ніж твій основний — тому вона нижче за
              вакансії твого стеку (за окремими скілами все одно може підходити).
            </TooltipContent>
          </Tooltip>
        ) : null}
        <span className="text-text-secondary">
          required <span className="text-text-primary">{item.fit.matchedRequired}/{item.fit.requiredTotal}</span>
        </span>
        <span className="ml-auto text-accent">
          relevance <span className="font-bold">{item.relevance.toFixed(1)}</span>
        </span>
      </div>

      {(item.diff.have.length > 0 ||
        item.diff.missing.length > 0 ||
        item.diff.bonus.length > 0) && (
        <div className="flex flex-col gap-2 border border-b-0 border-border bg-bg-card px-6 pb-4 pt-1">
          <SkillLine sign="✅" label="ти маєш" tone="have" skills={item.diff.have} />
          <SkillLine sign="❌" label="бракує" tone="missing" skills={item.diff.missing} max={8} />
          <SkillLine sign="➕" label="бонус" tone="bonus" skills={item.diff.bonus} max={8} />
        </div>
      )}

      <VacancyCard vacancy={item.vacancy} />
    </div>
  );
}

function SkillLine({
  sign,
  label,
  tone,
  skills,
  max = 14,
}: {
  sign: string;
  label: string;
  tone: SkillTone;
  skills: SkillRef[];
  max?: number;
}) {
  if (skills.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {sign} {label}
      </span>
      {skills.slice(0, max).map((s) => (
        <SkillChip key={s.id} name={s.name} tone={tone} compact hash={false} />
      ))}
      {skills.length > max ? (
        <span className="font-mono text-[11px] text-text-muted">+{skills.length - max}</span>
      ) : null}
    </div>
  );
}
