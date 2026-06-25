import type { RecommendItem, RecommendResponse } from "@/lib/api/ranking";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

// "What to learn next" — horizontal bars scaled to how many cohort vacancies
// each missing skill would unlock (marginal counterfactual, see ADR-0009). Bars
// make the relative payoff visceral; ⚡ marks the rarer/higher-leverage skills,
// the footer lists skills that barely move the needle in this niche.
export function SkillRecommendations({ rec }: { rec: RecommendResponse }) {
  const maxUnlocks = rec.items[0]?.unlocks ?? 0;

  return (
    <div className="border border-border bg-bg-card">
      <div className="h-1 bg-success" />
      <div className="flex flex-col gap-4 px-5 py-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-success">
            що вчити далі
          </p>
          {rec.cohortSize > 0 ? (
            <p className="mt-1 font-mono text-[10px] text-text-muted">
              ніша · {rec.cohortSize} вакансій
            </p>
          ) : null}
        </div>

        {rec.cohortSize > 0 ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-text-muted">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-dotted decoration-from-font underline-offset-2">
                    покриття ніші
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  «ніша» — вакансії твоєї ролі та суміжного рівня сеньорності. цей
                  відсоток показує, скільки з них твій CV уже закриває на GOOD+
                  (≥50% зваженого за рідкістю покриття обовʼязкових скілів). скіли
                  нижче піднімають його найшвидше.
                </TooltipContent>
              </Tooltip>
              <span className="text-accent">{rec.coveragePct}%</span>
            </div>
            <div className="h-1.5 w-full bg-border">
              <div
                className="h-full bg-accent"
                style={{ width: `${rec.coveragePct}%` }}
              />
            </div>
          </div>
        ) : null}

        {rec.reducedState ? (
          <p className="font-mono text-[11px] leading-relaxed text-text-muted">
            замало даних для рекомендацій по твоїй ніші
          </p>
        ) : rec.items.length === 0 ? (
          <p className="font-mono text-[11px] leading-relaxed text-text-muted">
            твій стек уже покриває цю нішу — чітких скілів для прокачки немає
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {rec.items.map((item) => (
                <Bar key={item.nodeId} item={item} max={maxUnlocks} />
              ))}
            </div>
            <p className="font-mono text-[10px] text-text-muted">
              ⚡ висока віддача · рідкісний скіл у попиті
            </p>
          </>
        )}

        {rec.redundant.length > 0 ? (
          <p className="border-t border-border pt-3 font-mono text-[10px] leading-relaxed text-text-muted">
            майже не впливають: {rec.redundant.map(lower).join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Bar({ item, max }: { item: RecommendItem; max: number }) {
  const pct = max > 0 ? Math.max(8, Math.round((item.unlocks / max) * 100)) : 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 font-mono">
        <span className="truncate text-xs text-text-secondary">
          {lower(item.name)}
        </span>
        <span className="shrink-0 text-xs font-bold text-success">
          +{item.unlocks}
          {item.leverage ? <span className="ml-1 text-accent">⚡</span> : null}
        </span>
      </div>
      <div className="h-2 w-full bg-border">
        <div className="h-full bg-success/70" style={{ width: `${pct}%` }} />
      </div>
      {item.toStrong > 0 ? (
        <span className="font-mono text-[10px] text-text-muted">
          → {item.toStrong} у STRONG
        </span>
      ) : null}
    </div>
  );
}

function lower(s: string): string {
  return s.toLowerCase();
}
