import { cn } from "@/lib/utils";
import { Callout } from "./Callout";
import { match } from "./data";
import { Panel } from "./Panel";
import { StageHead } from "./StageHead";
import { SubStats } from "./SubStats";

export function MatchSection() {
  return (
    <section id="match" className="scroll-mt-24 border-t border-border py-14">
      <StageHead num="04" title="match — the IDF model" />
      <SubStats items={match.substats} />
      <p className="mb-6 max-w-[680px] font-body text-sm leading-[1.6] text-text-secondary">
        Ranking your CV against the market isn&apos;t keyword counting. A rare skill should count
        for more than one everybody lists. So each skill is weighted by inverse document
        frequency — how uncommon it is across all vacancies — and your match score is the sum of
        those weights over the skills you share.
      </p>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-start">
        <div>
          <div className="overflow-x-auto border border-accent bg-bg p-5 font-mono text-sm leading-[2.2] shadow-brut">
            <div className="whitespace-nowrap">
              <span className="text-accent">IDF(s)</span> <span className="text-text-muted">=</span>{" "}
              √( <span className="text-success">max</span>( ln({" "}
              <span className="text-accent-secondary">N</span> / (
              <span className="text-accent-secondary">df(s)</span> + 5) ), 0 )
            </div>
            <div className="whitespace-nowrap">
              <span className="text-accent">relevance</span> <span className="text-text-muted">=</span>{" "}
              <span className="text-text-muted">Σ</span> <span className="text-accent">IDF(s)</span>{" "}
              <span className="text-text-muted">for s in</span> (
              <span className="text-accent-secondary">CV</span> ∩{" "}
              <span className="text-accent-secondary">job</span> )
            </div>
            <div className="whitespace-nowrap">
              <span className="text-accent">coverage</span> <span className="text-text-muted">=</span>{" "}
              <span className="text-text-muted">Σ</span>IDF(required ∩ CV){" "}
              <span className="text-text-muted">/</span> <span className="text-text-muted">Σ</span>
              IDF(required)
            </div>
            <div className="whitespace-nowrap">
              <span className="text-text-muted">tier =</span> <span className="text-success">STRONG</span>{" "}
              if ≥ 0.8 · <span className="text-success">GOOD</span> if ≥ 0.5 · else STRETCH
            </div>
          </div>
          <div className="mt-3 space-y-1 font-mono text-xs text-text-secondary">
            <div>
              <span className="text-accent-secondary">N</span> = total vacancies (
              <span className="font-bold text-text-primary">10,839</span>) ·{" "}
              <span className="text-accent-secondary">df(s)</span> = vacancies tagging skill s
            </div>
            <div>
              +5 = smoothing · <span className="text-success">max(…,0)</span> clamps ultra-common
              skills to 0
            </div>
            <div>
              final sort: <span className="text-text-muted">(on-stack, tier, relevance)</span>{" "}
              descending
            </div>
          </div>
          <div className="mt-4 border border-border bg-bg-elev p-3 font-mono text-xs">
            example — Go backend CV vs &quot;Middle Golang Developer&quot;:
            <br />
            relevance = <span className="font-bold text-success">16.75</span> · required coverage
            → tier <span className="font-bold text-accent">STRONG</span>
          </div>
        </div>

        <Panel label="skill weights = rarity (higher IDF = rarer)">
          <div className="flex flex-col gap-2">
            {match.idfBars.map((bar) => (
              <div key={bar.name} className="flex items-center gap-2.5">
                <span className="w-24 shrink-0 font-mono text-xs text-text-primary">
                  {bar.name}
                </span>
                <span className="h-3.5 flex-1 border border-border bg-bg-elev">
                  <span
                    className={cn("block h-full", bar.low ? "bg-border-strong" : "bg-accent")}
                    style={{ width: `${bar.pct}%` }}
                  />
                </span>
                <span className="w-[74px] shrink-0 text-right font-mono text-2xs text-text-secondary">
                  {bar.note}
                </span>
              </div>
            ))}
          </div>
          <Callout className="mt-4">
            Seniority, years, freshness and English are{" "}
            <span className="font-bold text-text-primary">filters</span>, not score inputs — they
            narrow the set; IDF relevance orders what&apos;s left.
          </Callout>
        </Panel>
      </div>
    </section>
  );
}
