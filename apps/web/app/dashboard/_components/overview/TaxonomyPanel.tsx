import type { AxisCoverage, TaxonomyCoverage } from "@/lib/api/taxonomy";
import { formatCount } from "@/lib/format";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { MeterRow } from "@/ui/data/MeterRow";
import { Panel } from "@/ui/layout/Panel";
import { PanelLink } from "@/ui/navigation/PanelLink";

const AXES: Array<{ key: "role" | "skill" | "domain"; label: string }> = [
  { key: "role", label: "roles" },
  { key: "skill", label: "skills" },
  { key: "domain", label: "domains" },
];

// Coverage = verified / (verified + new). `missing` is excluded on purpose:
// those are empty links, not dictionary entries the curator can act on.
function coveragePct(axis: AxisCoverage): number {
  const denom = axis.verified + axis.new;
  return denom === 0 ? 0 : Math.round((axis.verified / denom) * 100);
}

export function TaxonomyPanel({ coverage }: { coverage: TaxonomyCoverage | null }) {
  if (!coverage) {
    return (
      <Panel title="Taxonomy">
        <EmptyState title="dictionary api unavailable" tone="danger" />
      </Panel>
    );
  }

  const queue = coverage.byAxis.role.new + coverage.byAxis.skill.new + coverage.byAxis.domain.new;

  return (
    <Panel title="Taxonomy" meta="verified share">
      <div className="flex flex-col gap-4">
        {AXES.map(({ key, label }) => {
          const axis = coverage.byAxis[key];
          const pct = coveragePct(axis);
          return (
            <MeterRow
              key={key}
              label={label}
              value={`${pct}%`}
              pct={pct}
              note={`${formatCount(axis.verified)} verified · ${formatCount(axis.new)} pending`}
              tone={pct >= 80 ? "accent" : pct >= 50 ? "neutral" : "danger"}
            />
          );
        })}
      </div>
      <div className="mt-auto pt-2">
        <PanelLink href="/dashboard/taxonomy">review queue · {formatCount(queue)}</PanelLink>
      </div>
    </Panel>
  );
}
