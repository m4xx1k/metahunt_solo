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
            what to learn next
          </p>
          {rec.cohortSize > 0 ? (
            <p className="mt-1 font-mono text-[10px] text-text-muted">
              niche · {rec.cohortSize} jobs
            </p>
          ) : null}
        </div>

        {rec.cohortSize > 0 ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-text-muted">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-dotted decoration-from-font underline-offset-2">
                    niche coverage
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  A &quot;niche&quot; = jobs for your role and adjacent seniority. The %
                  = the share of them your CV already covers at GOOD+ (≥50%
                  rarity-weighted coverage of required skills). The skills
                  below raise it fastest.
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
            not enough data for recommendations in your niche
          </p>
        ) : rec.items.length === 0 ? (
          <p className="font-mono text-[11px] leading-relaxed text-text-muted">
            your stack already covers this niche — nothing sharp to level up
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {rec.items.map((item) => (
                <Bar key={item.nodeId} item={item} max={maxUnlocks} />
              ))}
            </div>
            <p className="font-mono text-[10px] text-text-muted">
              ⚡ high payoff · rare skill in demand
            </p>
          </>
        )}

        {rec.redundant.length > 0 ? (
          <p className="border-t border-border pt-3 font-mono text-[10px] leading-relaxed text-text-muted">
            barely moves the needle: {rec.redundant.map(lower).join(" · ")}
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
          → {item.toStrong} to STRONG
        </span>
      ) : null}
    </div>
  );
}

function lower(s: string): string {
  return s.toLowerCase();
}
