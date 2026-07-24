import type { TaxonomyCoverage } from "@/lib/api/taxonomy";
import { AxisBar } from "./AxisBar";
import { VerifiedDonut } from "./VerifiedDonut";

// Collapsible analytics overview at the top of the workspace. Uses the
// native <details>/<summary> pair so it can stay a Server Component — no
// state to track, no hydration cost, and the collapsed state persists per
// page-load without us managing it.
export function AnalyticsStrip({ coverage }: { coverage: TaxonomyCoverage | null }) {
  if (!coverage) {
    return (
      <p className="border border-danger bg-bg-card p-3 font-mono text-xs text-danger">
        coverage metrics are unavailable
      </p>
    );
  }

  return (
    <details className="border border-border bg-bg-card" open>
      <summary className="flex cursor-pointer items-center justify-between gap-3 border-b border-border bg-bg-elev px-4 py-2 font-mono text-2xs uppercase tracking-wider text-text-muted">
        <span>dictionary coverage · {coverage.byAxis.role.total} vacancies</span>
        <span className="text-text-secondary">expand / collapse</span>
      </summary>
      <div className="grid gap-4 p-3 sm:gap-5 sm:p-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <AxisBar axis="role" coverage={coverage.byAxis.role} />
          <AxisBar axis="skill" coverage={coverage.byAxis.skill} />
          <AxisBar axis="domain" coverage={coverage.byAxis.domain} />
        </div>
        <VerifiedDonut
          fullyVerified={coverage.fullyVerified.fullyVerified}
          total={coverage.fullyVerified.total}
        />
      </div>
    </details>
  );
}
