import { cn } from "@/lib/utils";

export type GoldenFact = {
  label: string;
  value: string;
  highlight?: boolean;
};

export type GoldenAction = {
  label: string;
  icon?: React.ReactNode;
};

export type GoldenAi = {
  matchPercent: number;
  gap?: string;
};

export type GoldenJob = {
  meta: string[];
  match?: string;
  title: string;
  company: string;
  productTag?: string;
  facts: Array<GoldenFact | GoldenFact[]>;
  ai: GoldenAi;
  actions: GoldenAction[];
  appliesOn: string[];
};

function MatchBar({ percent }: { percent: number }) {
  const filled = Math.round((percent / 100) * 8);
  return (
    <span className="font-mono text-[13px] text-text-primary">
      match: [{"█".repeat(filled)}{"░".repeat(8 - filled)}] {percent}%
    </span>
  );
}

export function GoldenJobCard({
  job,
  className,
}: {
  job: GoldenJob;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-8 border border-accent bg-bg-card p-8 shadow-[12px_12px_0_0_#000]",
        className,
      )}
    >
      <div className="flex flex-col gap-10 md:flex-row">
        <div className="flex flex-1 flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            {job.meta.map((m, i) => (
              <span key={i} className="font-mono text-xs text-text-muted">
                {m}
              </span>
            ))}
            
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="font-mono text-lg font-bold text-text-primary">
              {job.title}
            </h3>
            <div className="flex items-center gap-2">
<div className="font-body text-sm text-text-secondary">
              {job.company}
            </div>
            {job.productTag && (
              <div className="font-mono text-xs text-text-muted">
                {job.productTag}
              </div>
            )}
            </div>
            
          </div>
          <div className="flex flex-col gap-4">
            {job.facts.map((f) => {
              const Fact = ({f}: {f:GoldenFact}) => (
                <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  {f.label}
                </span>
                <span
                  className={cn(
                    "font-mono text-[13px]",
                    f.highlight
                      ? "text-success text-base font-bold"
                      : "text-text-primary",
                  )}
                >
                  {f.value}
                </span>
              </div>
              )
              const isArray = Array.isArray(f);
              
              return (
              isArray ? (
                <div className="flex gap-12">
                  {f.map((fact) => (
                    <Fact key={fact.label} f={fact} />
                  ))}
                </div>
              ) : (
                <Fact key={f.label} f={f} />
              )
            )})}
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 md:w-[240px]">
          <div className="flex flex-col gap-2 border border-accent bg-bg-elev p-4">
            <span className="font-mono text-[11px] font-bold text-accent">
              &gt; ai skill analysis:
            </span>
            <MatchBar percent={job.ai.matchPercent} />
            {job.ai.gap && (
              <span className="font-mono text-xs text-text-muted">
                gap: {job.ai.gap}
              </span>
            )}
          </div>
          {job.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className="flex items-center justify-center gap-2 border border-accent bg-bg px-4 py-[10px] font-body text-xs text-text-primary shadow-[4px_4px_0_0_#000] transition-[transform,box-shadow] hover:shadow-[2px_2px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px]"
            >
              {a.icon && <span className="text-accent">{a.icon}</span>}
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5">
        <span className="font-mono text-xs font-bold text-accent">
          &gt; apply on:
        </span>
        {job.appliesOn.map((src, i) => (
          <span
            key={src}
            className="flex items-center gap-4 font-mono text-xs text-text-secondary"
          >
            {src}
            {i < job.appliesOn.length - 1 && (
              <span className="text-text-muted">·</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
