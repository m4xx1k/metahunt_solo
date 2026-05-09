import type { TaxonomyCoverage } from "@/lib/api/taxonomy";
import { Tag } from "@/components/ui-kit";
import { AxisBar } from "./AxisBar";
import { VerifiedDonut } from "./VerifiedDonut";
import { BucketHistogram } from "./BucketHistogram";

export function CoveragePanel({ coverage }: { coverage: TaxonomyCoverage }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Tag>&gt; coverage</Tag>
        <h3 className="font-display text-xl font-bold text-text-primary">
          axis coverage
        </h3>
      </div>

      <div className="flex flex-col gap-5 border border-border bg-bg-card p-5">
        <AxisBar axis="role" coverage={coverage.byAxis.role} />
        <AxisBar axis="skill" coverage={coverage.byAxis.skill} />
        <AxisBar axis="domain" coverage={coverage.byAxis.domain} />
      </div>

      <VerifiedDonut
        fullyVerified={coverage.fullyVerified.fullyVerified}
        total={coverage.fullyVerified.total}
      />

      <BucketHistogram buckets={coverage.skillBuckets} />

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          per-source breakdown · skill links
        </span>
        <table className="w-full border border-border bg-bg-card font-mono text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-elev text-[11px] uppercase tracking-wider text-text-muted">
              <th className="px-3 py-2 text-left">code</th>
              <th className="px-3 py-2 text-right">vacancies</th>
              <th className="px-3 py-2 text-right">links</th>
              <th className="px-3 py-2 text-right">% verified</th>
            </tr>
          </thead>
          <tbody>
            {coverage.bySource.map((s) => (
              <tr
                key={s.code}
                className="border-b border-border last:border-b-0"
              >
                <td className="px-3 py-2 text-accent">{s.code}</td>
                <td className="px-3 py-2 text-right">{s.vacancies}</td>
                <td className="px-3 py-2 text-right">{s.links}</td>
                <td className="px-3 py-2 text-right">{s.pct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
