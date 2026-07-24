import type { Metadata } from "next";

import { dedupApi, type DedupConfidence } from "@/lib/api/dedup";
import {
  booleanSearchParam,
  firstSearchParam,
  flattenSearchParams,
  type SearchParamValue,
} from "@/lib/search-params";
import { formatCount, formatPercent } from "@/lib/format";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { FilterToggles } from "@/ui/inputs/FilterToggles";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { ConfidenceFilter } from "./_components/ConfidenceFilter";
import { GroupCard } from "./_components/GroupCard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dedupe" };

function asConfidence(value: SearchParamValue): DedupConfidence | "all" {
  const raw = firstSearchParam(value);
  return raw === "gold" || raw === "confirmed" ? raw : "all";
}

// Gold tier: one group per real position, with every source posting that got
// merged into it.
export default async function DedupePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const crossSource = booleanSearchParam(sp.crossSource);
  const confidence = asConfidence(sp.confidence);

  const data = await dedupApi.list({
    crossSource: crossSource || undefined,
    confidence: confidence !== "all" ? confidence : undefined,
    pageSize: 100,
  });

  const flatSearchParams = flattenSearchParams(sp);
  const { metrics } = data;

  return (
    <>
      <PageHeader
        title="Dedupe"
        hint={`gold tier · ${formatCount(data.pagination.total)} groups match`}
      />

      <PageBody>
        <StatGrid cols={4}>
          <StatCard
            label="analysed"
            value={formatCount(metrics.totalVacancies)}
            hint="silver postings compared"
            href="/dashboard/vacancies"
          />
          <StatCard
            label="unique"
            value={formatCount(metrics.totalGroups)}
            hint="distinct positions"
          />
          <StatCard
            label="cross-source"
            value={formatCount(metrics.crossSourceGroups)}
            hint={`${formatPercent(metrics.crossSourceGroups, metrics.totalGroups)} of groups`}
            tone="accent"
          />
          <StatCard
            label="avg group"
            value={metrics.avgGroupSize.toFixed(2)}
            hint="postings per position"
          />
        </StatGrid>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <FilterToggles
            basePath="/dashboard/dedupe"
            searchParams={flatSearchParams}
            toggles={[
              {
                key: "crossSource",
                offLabel: "all groups",
                onLabel: "cross-source only",
                active: crossSource,
              },
            ]}
          />
          <ConfidenceFilter
            basePath="/dashboard/dedupe"
            searchParams={flatSearchParams}
            active={confidence}
          />
        </div>

        {data.items.length === 0 ? (
          <EmptyState title="no groups match these filters" hint="loosen the confidence filter." />
        ) : (
          <div className="flex flex-col gap-3">
            {data.items.map((group) => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
