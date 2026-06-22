import Link from "next/link";
import type { AxisCoverage, TaxonomyCoverage } from "@/lib/api/taxonomy";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  coverage: TaxonomyCoverage | null;
};

const AXIS_LABEL: Record<"role" | "skill" | "domain", string> = {
  role: "Ролі",
  skill: "Навички",
  domain: "Напрями",
};

// Coverage % = verified / (verified + new). `missing` сюди не входить —
// це порожні зв'язки, не сутності довідника. Для головного дашборду
// важливіший саме баланс «підтверджені vs. на розгляді», бо саме на
// нього оператор може повпливати.
function coveragePct(axis: AxisCoverage): number {
  const denom = axis.verified + axis.new;
  if (denom === 0) return 0;
  return Math.round((axis.verified / denom) * 100);
}

export function TaxonomyHealth({ coverage }: Props) {
  if (!coverage) {
    return (
      <Panel title="Довідник понять">
        <p className="font-mono text-sm text-text-muted">
          API довідника недоступне
        </p>
      </Panel>
    );
  }

  const totalNew =
    coverage.byAxis.role.new +
    coverage.byAxis.skill.new +
    coverage.byAxis.domain.new;

  return (
    <Panel title="Довідник понять" subtitle="повнота за осями">
      <ul className="flex flex-col gap-4">
        {(["role", "skill", "domain"] as const).map((axis) => {
          const a = coverage.byAxis[axis];
          const pct = coveragePct(a);
          return (
            <li key={axis} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between font-mono text-xs">
                <span className="uppercase tracking-wider text-text-muted">
                  {AXIS_LABEL[axis]}
                </span>
                <span className="font-bold text-text-primary">{pct}%</span>
              </div>
              <div
                className="h-2 w-full border border-border bg-bg"
                aria-hidden="true"
              >
                <div
                  className={cn(
                    "h-full",
                    pct >= 80
                      ? "bg-accent"
                      : pct >= 50
                        ? "bg-text-primary"
                        : "bg-danger",
                  )}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <span className="font-mono text-2xs text-text-muted">
                {formatCount(a.verified)} підтверджених · {formatCount(a.new)} на
                розгляді
              </span>
            </li>
          );
        })}
      </ul>
      <Link
        href="/taxonomy"
        className="mt-auto inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline"
      >
        → черга на розгляд ({formatCount(totalNew)})
      </Link>
    </Panel>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-4 border border-border bg-bg-card p-5 shadow-brut-md">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-base font-bold text-text-primary">
          {title}
        </h3>
        {subtitle ? (
          <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
            {subtitle}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
