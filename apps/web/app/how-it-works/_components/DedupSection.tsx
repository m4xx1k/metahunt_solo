import { cn } from "@/lib/utils";
import { Callout } from "./Callout";
import { dedup } from "./data";
import { Panel } from "./Panel";
import { StageHead } from "./StageHead";
import { SubStats } from "./SubStats";

const listCls =
  "mb-3.5 list-disc space-y-1.5 pl-5 font-body text-sm leading-[1.5] text-text-secondary marker:text-border-strong";

export function DedupSection() {
  return (
    <section id="dedup" className="scroll-mt-24 border-t border-border py-14">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-start">
        <div>
          <StageHead num="03" title="dedup" />
          <SubStats items={dedup.substats} />
          <p className="mb-3.5 font-body text-sm leading-[1.6] text-text-secondary">
            The same job is posted on multiple boards, worded differently each time. Collapsing
            those into one golden record is the hard part — and it runs on two layers.
          </p>
          <h3 className="mb-2 font-mono text-sm font-bold text-text-primary">
            hard filters — exact, free
          </h3>
          <ul className={listCls}>
            {dedup.hardFilters.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3 className="mb-2 font-mono text-sm font-bold text-text-primary">
            soft filters — semantic, vectors
          </h3>
          <ul className={listCls}>
            {dedup.softFilters.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Callout>
            A Temporal <span className="font-mono font-bold text-accent">dedup-sweep</span> runs
            every 5 minutes, re-embedding new rows and resolving groups incrementally (→ gold).
          </Callout>
        </div>

        <Panel label="dedup funnel · 2026-07-07 snapshot">
          <div className="flex flex-col gap-2">
            {dedup.funnel.map((step, i) =>
              "down" in step ? (
                <div
                  key={`down-${i}`}
                  className="text-center font-mono text-2xs text-text-secondary"
                >
                  ↓ {step.down}
                </div>
              ) : (
                <div
                  key={step.label}
                  className={cn(
                    "relative border border-border bg-bg-elev px-3 py-2.5",
                    step.accent && "border-accent",
                  )}
                >
                  <div className="font-mono text-2xs text-text-secondary">{step.label}</div>
                  <div
                    className={cn(
                      "font-mono text-base font-bold text-text-primary",
                      step.accent && "text-accent",
                    )}
                  >
                    {step.value}
                  </div>
                  {step.threshold && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-2xs text-accent">
                      {step.threshold}
                    </span>
                  )}
                </div>
              ),
            )}
          </div>
          <Callout className="mt-3.5">
            Recall on in-window duplicate pairs:{" "}
            <span className="font-mono font-bold text-accent">89% (194/219)</span>.
            <span className="mt-1.5 block font-mono text-2xs text-text-muted">
              recall measured on a labeled set, 2026-07-05.
            </span>
          </Callout>
        </Panel>
      </div>
    </section>
  );
}
