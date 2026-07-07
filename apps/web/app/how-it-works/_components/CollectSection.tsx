import { Callout } from "./Callout";
import { collect } from "./data";
import { ExtLink } from "./ExtLink";
import { Panel } from "./Panel";
import { StageHead } from "./StageHead";
import { SubStats } from "./SubStats";

export function CollectSection() {
  return (
    <section id="collect" className="scroll-mt-24 border-t border-border py-14">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-start">
        <div>
          <StageHead num="01" title="collect" />
          <SubStats items={collect.substats} />
          <p className="mb-3.5 font-body text-sm leading-[1.6] text-text-secondary">
            A <ExtLink href="https://temporal.io">Temporal</ExtLink> schedule (
            <code className="bg-accent-subtle-bg px-1.5 py-0.5 font-mono text-[0.85em] text-accent">
              rss-ingest-hourly
            </code>
            ) wakes up every hour between 06:00–22:00 Kyiv and fans out one child workflow per
            source. Each runs a durable chain —{" "}
            <code className="bg-accent-subtle-bg px-1.5 py-0.5 font-mono text-[0.85em] text-accent">
              fetch → parse → extract → finalize
            </code>{" "}
            — with automatic retries, so a flaky feed never drops a batch.
          </p>
          <ul className="mb-3.5 list-disc space-y-1.5 pl-5 font-body text-sm leading-[1.5] text-text-secondary marker:text-border-strong">
            {collect.list.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Callout>
            <span className="font-mono font-bold text-accent">Why Temporal, not a cron?</span>{" "}
            Ingestion is a multi-step, retryable job over an unreliable network. Temporal makes
            every step durable and observable — a crash resumes mid-pipeline instead of silently
            losing a run.
          </Callout>
        </div>

        <Panel label="temporal schedule">
          <span className="inline-block border border-accent-secondary/40 bg-bg-elev px-2.5 py-1.5 font-mono text-xs font-bold text-accent-secondary">
            ◷ rss-ingest-hourly · every 1h · SKIP overlap
          </span>
          <div className="mt-3.5 flex gap-2.5">
            <div className="flex-1 border border-border bg-bg-elev p-2.5">
              <div className="font-mono text-xs font-bold text-accent">djinni</div>
              <div className="font-mono text-2xs text-text-muted">rss workflow</div>
            </div>
            <div className="flex-1 border border-border bg-bg-elev p-2.5">
              <div className="font-mono text-xs font-bold text-accent-secondary">dou</div>
              <div className="font-mono text-2xs text-text-muted">rss workflow</div>
            </div>
          </div>
          <div className="mt-3.5 flex flex-col gap-1.5">
            {collect.acts.map((act) => (
              <div
                key={act.label}
                className="flex items-center justify-between gap-2 border border-border px-2.5 py-1.5 font-mono text-2xs text-text-secondary"
              >
                <span className="font-semibold text-text-primary">{act.label}</span>
                <span>{act.note}</span>
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-success" />
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}
